const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const iceTokenRoute = require("./routes/ice-token.js");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const Room = require("./models/Room");
const Message = require("./models/Message");

// Connect to MongoDB
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://Gather_town_user:Anuj123@cluster0.iffwygr.mongodb.net/gathertown?retryWrites=true&w=majority&appName=Cluster0";

mongoose
  .connect(MONGO_URI, { dbName: "gathertown" })
  .then(() => console.log("MongoDB connected successfully to database: gathertown"))
  .catch((err) => {
    console.warn(
      "MongoDB connection warning (database features will retry):",
      err.message
    );
  });

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const app = express();
app.use(cors());

// Normalize duplicate slashes in incoming request URLs (e.g. //api/rooms -> /api/rooms)
app.use((req, res, next) => {
  req.url = req.url.replace(/\/{2,}/g, "/");
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("uploads")); // Serve static files from uploads directory

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// API Routes
app.use("/api/ice-token", iceTokenRoute);
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);

// File upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const baseUrl =
    process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  res.json({
    filePath: `${baseUrl}/${req.file.filename}`,
  });
});

// Multi-tenant Room State
const rooms = {};

function getRoom(code = "default") {
  const normalized = code.toLowerCase();
  if (!rooms[normalized]) {
    rooms[normalized] = {
      players: {},
      users: {}, // username -> socketId
      userMeta: {}, // socketId -> { username, userId }
      chatMap: new Map(),
      meetingRoomParticipants: new Set(),
    };
  }
  return rooms[normalized];
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);
  socket.roomCode = "default";

  // Handle joining a specific room
  socket.on("joinRoom", ({ roomCode = "default", playerName, avatar }) => {
    // Leave previous room if any
    if (socket.roomCode && socket.roomCode !== roomCode) {
      const prevRoom = getRoom(socket.roomCode);
      delete prevRoom.players[socket.id];
      socket.leave(socket.roomCode);
      io.to(socket.roomCode).emit("playerDisconnected", socket.id);
    }

    const normalizedRoom = (roomCode || "default").toLowerCase();
    socket.roomCode = normalizedRoom;
    socket.join(normalizedRoom);

    const room = getRoom(normalizedRoom);

    const effectiveName = playerName || `Player-${socket.id.substr(0, 4)}`;

    // Auto-persist room to MongoDB if it does not exist yet
    if (normalizedRoom && normalizedRoom !== "default") {
      Room.findOne({ code: normalizedRoom })
        .then(async (existingRoom) => {
          if (!existingRoom) {
            console.log(`[MongoDB] Auto-persisting room "${normalizedRoom}" to database`);
            await Room.create({
              name: `Space ${normalizedRoom.toUpperCase()}`,
              code: normalizedRoom,
              ownerName: effectiveName,
              isPrivate: false,
            });
          }
        })
        .catch((err) => console.error("Error auto-persisting room:", err.message));
    }

    // Clean up any ghost players with the same name or old socket IDs
    if (effectiveName && effectiveName !== "Explorer") {
      Object.keys(room.players).forEach((oldId) => {
        if (oldId !== socket.id && room.players[oldId].name === effectiveName) {
          console.log(`Cleaning up ghost player "${effectiveName}" (${oldId})`);
          delete room.players[oldId];
          io.to(normalizedRoom).emit("playerDisconnected", oldId);
        }
      });
    }

    const newPlayer = {
      position: room.players[socket.id]?.position || { x: 300, y: 300 },
      direction: "down",
      name: effectiveName,
      avatar: avatar || "chr1",
      id: socket.id,
      moving: false,
    };
    room.players[socket.id] = newPlayer;

    console.log(
      `Player "${newPlayer.name}" joined room "${normalizedRoom}". Total: ${
        Object.keys(room.players).length
      }`
    );

    // Send existing players in this room to the new player
    const otherPlayers = Object.fromEntries(
      Object.entries(room.players).filter(([id]) => id !== socket.id)
    );
    socket.emit("currentPlayers", otherPlayers);

    // Broadcast new player to others in the room
    socket.to(normalizedRoom).emit("newPlayer", newPlayer);
  });

  // Re-request players list
  socket.on("requestPlayers", () => {
    const room = getRoom(socket.roomCode);
    const currentOtherPlayers = Object.fromEntries(
      Object.entries(room.players).filter(([id]) => id !== socket.id)
    );
    socket.emit("currentPlayers", currentOtherPlayers);
  });

  // Handle player movement within their room (broadcast only to other peers to eliminate network echo)
  socket.on("playerMovement", (movementData) => {
    const room = getRoom(socket.roomCode);
    if (room.players[socket.id]) {
      room.players[socket.id] = {
        ...room.players[socket.id],
        ...movementData,
      };
      // Broadcast to other players in the same room (excludes sender to save 50% bandwidth)
      socket.to(socket.roomCode).emit("playerMoved", room.players[socket.id]);
    }
  });

  // ===== CHAT FUNCTIONALITY =====

  // Register username in room (supports string or { username, userId })
  socket.on("register", (data) => {
    const room = getRoom(socket.roomCode);
    const username = typeof data === "object" ? data.username : data;
    const userId = typeof data === "object" ? data.userId : null;

    if (username) {
      room.users[username] = socket.id;
      room.userMeta = room.userMeta || {};
      room.userMeta[socket.id] = { username, userId };

      if (room.players[socket.id]) {
        room.players[socket.id].name = username;
        io.to(socket.roomCode).emit("playerMoved", room.players[socket.id]);
      }

      console.log(
        `User ${username} registered in room ${socket.roomCode} (${socket.id})`
      );
      io.to(socket.roomCode).emit("onlineUserswithnames", room.users);
    }
  });

  // Send direct message with MongoDB persistence
  socket.on(
    "sendMessage",
    async ({
      listner,
      message,
      senderUsername,
      recipientUsername,
      senderUserId,
      recipientUserId,
    }) => {
      try {
        if (!message || !message.trim()) return;

        const room = getRoom(socket.roomCode);

        const sUser =
          senderUsername ||
          room.userMeta?.[socket.id]?.username ||
          Object.keys(room.users).find((k) => room.users[k] === socket.id) ||
          room.players[socket.id]?.name ||
          `User-${socket.id.substr(0, 4)}`;

        const rUser =
          recipientUsername ||
          room.userMeta?.[listner]?.username ||
          Object.keys(room.users).find((k) => room.users[k] === listner) ||
          room.players[listner]?.name ||
          `User-${listner ? listner.substr(0, 4) : "anon"}`;

        const convKey = [sUser.toLowerCase(), rUser.toLowerCase()]
          .sort()
          .join("::");
        const sId =
          senderUserId || room.userMeta?.[socket.id]?.userId || null;
        const rId =
          recipientUserId || room.userMeta?.[listner]?.userId || null;

        // Save to MongoDB
        let savedMsgDoc = null;
        try {
          const msgDoc = new Message({
            roomCode: socket.roomCode,
            conversationKey: convKey,
            senderId: sId,
            senderUsername: sUser,
            recipientId: rId,
            recipientUsername: rUser,
            message: message.trim(),
            isEdited: false,
            isDeleted: false,
          });
          savedMsgDoc = await msgDoc.save();
        } catch (dbErr) {
          console.error("Error saving message to MongoDB:", dbErr.message);
        }

        // Query past messages from MongoDB for this conversation in this room
        let formattedHistory = [];
        try {
          const historyDocs = await Message.find({
            roomCode: socket.roomCode,
            conversationKey: convKey,
            isDeleted: { $ne: true },
          })
            .sort({ createdAt: 1 })
            .limit(100);

          formattedHistory = historyDocs.map((doc) => ({
            _id: doc._id.toString(),
            sender:
              doc.senderUsername.toLowerCase() === sUser.toLowerCase()
                ? socket.id
                : room.users[doc.senderUsername] || doc.senderUsername,
            senderUsername: doc.senderUsername,
            senderId: doc.senderId,
            recipientUsername: doc.recipientUsername,
            message: doc.message,
            createdAt: doc.createdAt,
            timestamp: doc.createdAt,
            isEdited: doc.isEdited,
            editedAt: doc.editedAt,
            isDeleted: doc.isDeleted,
          }));
        } catch (qErr) {
          console.error("Error fetching message history:", qErr.message);
        }

        if (formattedHistory.length === 0) {
          formattedHistory = [
            {
              _id: savedMsgDoc
                ? savedMsgDoc._id.toString()
                : `temp-${Date.now()}`,
              sender: socket.id,
              senderUsername: sUser,
              senderId: sId,
              recipientUsername: rUser,
              message: message.trim(),
              createdAt: new Date(),
              timestamp: new Date(),
              isEdited: false,
              isDeleted: false,
            },
          ];
        }

        const singleMsgObj = {
          _id: savedMsgDoc
            ? savedMsgDoc._id.toString()
            : `temp-${Date.now()}`,
          sender: socket.id,
          senderUsername: sUser,
          senderId: sId,
          recipient: listner,
          recipientUsername: rUser,
          message: message.trim(),
          createdAt: savedMsgDoc ? savedMsgDoc.createdAt : new Date(),
          timestamp: savedMsgDoc ? savedMsgDoc.createdAt : new Date(),
          isEdited: false,
          isDeleted: false,
        };

        // Emit to recipient
        if (listner) {
          io.to(listner).emit(
            "receive_message_sec",
            formattedHistory,
            socket.id,
            singleMsgObj
          );
          io.to(listner).emit("message_sent", formattedHistory, socket.id);
        }

        // Emit to sender
        socket.emit("receive_message", formattedHistory);
      } catch (err) {
        console.error("Error in sendMessage handler:", err);
      }
    }
  );

  // Helper for fetching chat history
  const fetchAndEmitChatHistory = async (param) => {
    try {
      const room = getRoom(socket.roomCode);
      let targetSocketId =
        typeof param === "string" ? param : param?.listner || param?.targetId;
      let targetUsername =
        typeof param === "object" ? param.targetUsername : null;

      if (!targetUsername && targetSocketId) {
        targetUsername =
          room.userMeta?.[targetSocketId]?.username ||
          Object.keys(room.users).find(
            (k) => room.users[k] === targetSocketId
          ) ||
          room.players[targetSocketId]?.name;
      }

      const currentUsername =
        room.userMeta?.[socket.id]?.username ||
        Object.keys(room.users).find((k) => room.users[k] === socket.id) ||
        room.players[socket.id]?.name;

      if (currentUsername && targetUsername) {
        const convKey = [
          currentUsername.toLowerCase(),
          targetUsername.toLowerCase(),
        ]
          .sort()
          .join("::");

        const historyDocs = await Message.find({
          roomCode: socket.roomCode,
          conversationKey: convKey,
          isDeleted: { $ne: true },
        })
          .sort({ createdAt: 1 })
          .limit(100);

        const formattedHistory = historyDocs.map((doc) => ({
          _id: doc._id.toString(),
          sender:
            doc.senderUsername.toLowerCase() === currentUsername.toLowerCase()
              ? socket.id
              : room.users[doc.senderUsername] ||
                targetSocketId ||
                doc.senderUsername,
          senderUsername: doc.senderUsername,
          senderId: doc.senderId,
          recipientUsername: doc.recipientUsername,
          message: doc.message,
          createdAt: doc.createdAt,
          timestamp: doc.createdAt,
          isEdited: doc.isEdited,
          editedAt: doc.editedAt,
          isDeleted: doc.isDeleted,
        }));

        socket.emit("receive_message", formattedHistory);
      } else {
        socket.emit("receive_message", []);
      }
    } catch (err) {
      console.error("Error in getChatHistory handler:", err);
      socket.emit("receive_message", []);
    }
  };

  socket.on("getChatHistory", fetchAndEmitChatHistory);
  socket.on("getchathistory", fetchAndEmitChatHistory);

  // Edit message in MongoDB
  socket.on("editMessage", async ({ messageId, newMessage, listner }) => {
    try {
      if (!messageId || !newMessage || !newMessage.trim()) return;
      const trimmed = newMessage.trim();

      const updated = await Message.findByIdAndUpdate(
        messageId,
        { message: trimmed, isEdited: true, editedAt: new Date() },
        { new: true }
      );

      const payload = {
        messageId,
        newMessage: trimmed,
        isEdited: true,
        editedAt: updated ? updated.editedAt : new Date(),
      };

      socket.emit("message_edited", payload);
      if (listner) {
        io.to(listner).emit("message_edited", payload);
      }
    } catch (err) {
      console.error("Error editing message:", err);
    }
  });

  // Delete message in MongoDB (soft delete)
  socket.on("deleteMessage", async ({ messageId, listner }) => {
    try {
      if (!messageId) return;

      await Message.findByIdAndUpdate(messageId, { isDeleted: true });

      const payload = { messageId };
      socket.emit("message_deleted", payload);
      if (listner) {
        io.to(listner).emit("message_deleted", payload);
      }
    } catch (err) {
      console.error("Error deleting message:", err);
    }
  });

  // ===== VOICE / VIDEO CALL POPUP =====
  socket.on("callUser", ({ targetId, callerName }) => {
    const room = getRoom(socket.roomCode);
    console.log(`[Call] ${socket.id} (${callerName}) calling ${targetId}`);
    io.to(targetId).emit("receiveCall", {
      callerId: socket.id,
      callerName:
        callerName ||
        room.players[socket.id]?.name ||
        `Player-${socket.id.substr(0, 4)}`,
    });
  });

  // WebRTC signaling relay
  socket.on("offer", ({ to, offer }) => {
    console.log(`[WebRTC 1-1] Offer from ${socket.id} -> ${to}`);
    io.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    console.log(`[WebRTC 1-1] Answer from ${socket.id} -> ${to}`);
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("acceptCall", ({ to }) => {
    console.log(`[Call] ${socket.id} accepted call from ${to}`);
    io.to(to).emit("acceptCall", { from: socket.id });
  });

  socket.on("endCall", ({ to }) => {
    console.log(`[Call] Call ended by ${socket.id}`);
    if (to) {
      io.to(to).emit("endCall");
    } else {
      socket.broadcast.emit("endCall");
    }
  });

  socket.on("screen-share-status", ({ to, isSharing }) => {
    if (to) {
      io.to(to).emit("screen-share-status", { from: socket.id, isSharing });
    }
  });

  // ===== MEETING / CONFERENCE ROOM (Zone 2) =====
  socket.on("joinMeetingRoom", () => {
    const room = getRoom(socket.roomCode);
    room.meetingRoomParticipants.add(socket.id);
    console.log(
      `[Conference] User ${socket.id} joined conference in room "${socket.roomCode}". Total in conf: ${room.meetingRoomParticipants.size}`
    );

    socket.to(socket.roomCode).emit("meeting-user-joined", { userId: socket.id });

    socket.emit("meeting-existing-participants", {
      participants: Array.from(room.meetingRoomParticipants).filter(
        (id) => id !== socket.id
      ),
    });
  });

  socket.on("leaveMeetingRoom", () => {
    const room = getRoom(socket.roomCode);
    room.meetingRoomParticipants.delete(socket.id);
    console.log(
      `[Conference] User ${socket.id} left conference in room "${socket.roomCode}". Total in conf: ${room.meetingRoomParticipants.size}`
    );
    io.to(socket.roomCode).emit("meeting-user-left", { userId: socket.id });
    io.to(socket.roomCode).emit("meeting-screen-status", { from: socket.id, isSharing: false });
  });

  socket.on("meeting-offer", ({ to, offer }) => {
    console.log(`[Conference] Offer from ${socket.id} -> ${to}`);
    io.to(to).emit("meeting-offer", { from: socket.id, offer });
  });

  socket.on("meeting-answer", ({ to, answer }) => {
    console.log(`[Conference] Answer from ${socket.id} -> ${to}`);
    io.to(to).emit("meeting-answer", { from: socket.id, answer });
  });

  socket.on("meeting-ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("meeting-ice-candidate", { from: socket.id, candidate });
  });

  socket.on("meeting-screen-status", ({ isSharing, presenterName }) => {
    socket.to(socket.roomCode).emit("meeting-screen-status", {
      from: socket.id,
      presenterName: presenterName || "Participant",
      isSharing,
    });
  });

  socket.on("meeting-media-status", ({ isMuted, isVideoOff }) => {
    socket.to(socket.roomCode).emit("meeting-media-status", {
      from: socket.id,
      isMuted,
      isVideoOff,
    });
  });

  socket.on("announceMeetingName", ({ name }) => {
    socket.to(socket.roomCode).emit("meeting-names", {
      [socket.id]: name,
    });
  });

  // ===== DISCONNECT CLEANUP =====
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id} from room ${socket.roomCode}`);
    const room = getRoom(socket.roomCode);

    // Player cleanup in active room
    if (room.players[socket.id]) {
      delete room.players[socket.id];
      io.to(socket.roomCode).emit("playerDisconnected", socket.id);
    }

    // Safety sweep: ensure socket is deleted across all rooms if any ghost reference exists
    Object.keys(rooms).forEach((rc) => {
      if (rooms[rc].players && rooms[rc].players[socket.id]) {
        delete rooms[rc].players[socket.id];
        io.to(rc).emit("playerDisconnected", socket.id);
      }
    });

    // Chat cleanup
    const username = Object.keys(room.users).find(
      (k) => room.users[k] === socket.id
    );
    if (username) {
      delete room.users[username];
      console.log(`User ${username} removed from room ${socket.roomCode}`);
    }
    if (room.userMeta && room.userMeta[socket.id]) {
      delete room.userMeta[socket.id];
    }
    io.to(socket.roomCode).emit("onlineUserswithnames", room.users);

    // Meeting cleanup
    if (room.meetingRoomParticipants.has(socket.id)) {
      room.meetingRoomParticipants.delete(socket.id);
      io.to(socket.roomCode).emit("meeting-user-left", { userId: socket.id });
      io.to(socket.roomCode).emit("meeting-screen-status", { from: socket.id, isSharing: false });
    }
    io.to(socket.roomCode).emit("participantLeft", { id: socket.id });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`GatherTown Backend running on port ${PORT}`);
});
