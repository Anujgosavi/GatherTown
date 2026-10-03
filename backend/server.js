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

// Connect to MongoDB
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gathertown";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
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

    const newPlayer = {
      position: { x: 300, y: 300 },
      direction: "down",
      name: playerName || `Player-${socket.id.substr(0, 4)}`,
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

  // Handle player movement within their room
  socket.on("playerMovement", (movementData) => {
    const room = getRoom(socket.roomCode);
    if (room.players[socket.id]) {
      room.players[socket.id] = {
        ...room.players[socket.id],
        ...movementData,
      };
      // Broadcast to all players in the same room
      io.to(socket.roomCode).emit("playerMoved", room.players[socket.id]);
    }
  });

  // ===== CHAT FUNCTIONALITY =====

  // Register username in room
  socket.on("register", (username) => {
    const room = getRoom(socket.roomCode);
    room.users[username] = socket.id;

    if (room.players[socket.id]) {
      room.players[socket.id].name = username;
      io.to(socket.roomCode).emit("playerMoved", room.players[socket.id]);
    }

    console.log(
      `User ${username} registered in room ${socket.roomCode} (${socket.id})`
    );
    io.to(socket.roomCode).emit("onlineUserswithnames", room.users);
  });

  // Send direct message
  socket.on("sendMessage", ({ listner, message }) => {
    const room = getRoom(socket.roomCode);
    const key = [listner, socket.id].sort().join("|");

    if (!room.chatMap.has(key)) {
      room.chatMap.set(key, []);
    }

    const senderUsername =
      Object.keys(room.users).find((k) => room.users[k] === socket.id) ||
      (room.players[socket.id]
        ? room.players[socket.id].name
        : `User-${socket.id.substr(0, 4)}`);

    const msgObj = {
      sender: socket.id,
      message,
      senderUsername,
      timestamp: new Date(),
    };

    room.chatMap.get(key).push(msgObj);

    io.to(listner).emit("receive_message_sec", room.chatMap.get(key), socket.id);
    socket.emit("receive_message", room.chatMap.get(key));
  });

  // Get chat history
  socket.on("getChatHistory", (userKey) => {
    const room = getRoom(socket.roomCode);
    const key = [userKey, socket.id].sort().join("|");

    if (!room.chatMap.has(key)) {
      room.chatMap.set(key, []);
    }

    socket.emit("receive_message", room.chatMap.get(key));
  });

  // Backward compatibility alias for getChatHistory
  socket.on("getchathistory", (userKey) => {
    const room = getRoom(socket.roomCode);
    const key = [userKey, socket.id].sort().join("|");

    if (!room.chatMap.has(key)) {
      room.chatMap.set(key, []);
    }

    socket.emit("receive_message", room.chatMap.get(key));
  });

  // ===== VOICE / VIDEO CALL POPUP =====
  socket.on("callUser", ({ targetId, callerName }) => {
    const room = getRoom(socket.roomCode);
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
    io.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("acceptCall", ({ to }) => {
    io.to(to).emit("acceptCall", { from: socket.id });
  });

  socket.on("endCall", ({ to }) => {
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
    io.to(socket.roomCode).emit("meeting-user-left", { userId: socket.id });
  });

  socket.on("meeting-offer", ({ to, offer }) => {
    io.to(to).emit("meeting-offer", { from: socket.id, offer });
  });

  socket.on("meeting-answer", ({ to, answer }) => {
    io.to(to).emit("meeting-answer", { from: socket.id, answer });
  });

  socket.on("meeting-ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("meeting-ice-candidate", { from: socket.id, candidate });
  });

  // ===== DISCONNECT CLEANUP =====
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id} from room ${socket.roomCode}`);
    const room = getRoom(socket.roomCode);

    // Player cleanup
    if (room.players[socket.id]) {
      delete room.players[socket.id];
      io.to(socket.roomCode).emit("playerDisconnected", socket.id);
    }

    // Chat cleanup
    const username = Object.keys(room.users).find(
      (k) => room.users[k] === socket.id
    );
    if (username) {
      delete room.users[username];
      console.log(`User ${username} removed from room ${socket.roomCode}`);
    }
    io.to(socket.roomCode).emit("onlineUserswithnames", room.users);

    // Meeting cleanup
    if (room.meetingRoomParticipants.has(socket.id)) {
      room.meetingRoomParticipants.delete(socket.id);
      io.to(socket.roomCode).emit("meeting-user-left", { userId: socket.id });
    }
    io.to(socket.roomCode).emit("participantLeft", { id: socket.id });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`GatherTown Backend running on port ${PORT}`);
});
