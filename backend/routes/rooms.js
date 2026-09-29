const express = require("express");
const router = express.Router();
const Room = require("../models/Room");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");

// Helper to generate readable 6-character room codes
function generateRoomCode() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Optional auth helper
function getOptionalUser(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      return jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// @route   POST /api/rooms/create
// @desc    Create a new room with a unique code
router.post("/create", async (req, res) => {
  try {
    const { name, isPrivate } = req.body;
    const user = getOptionalUser(req);

    let code;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      code = generateRoomCode();
      const existing = await Room.findOne({ code });
      if (!existing) isUnique = true;
      attempts++;
    }

    if (!isUnique) {
      code = `room-${Date.now().toString(36)}`;
    }

    const room = new Room({
      name: name || "Virtual Office",
      code,
      owner: user ? user.id : undefined,
      ownerName: user ? user.name : "Guest Host",
      isPrivate: !!isPrivate,
    });

    await room.save();

    res.status(201).json({
      room: {
        id: room._id,
        name: room.name,
        code: room.code,
        ownerName: room.ownerName,
        isPrivate: room.isPrivate,
        createdAt: room.createdAt,
      },
    });
  } catch (err) {
    console.error("Create room error:", err);
    res.status(500).json({ error: "Failed to create room." });
  }
});

// @route   GET /api/rooms/:roomCode
// @desc    Get room details by code
router.get("/:roomCode", async (req, res) => {
  try {
    const { roomCode } = req.params;
    const room = await Room.findOne({ code: roomCode.toLowerCase() });

    if (!room) {
      return res.status(404).json({ error: "Room not found." });
    }

    res.json({
      room: {
        id: room._id,
        name: room.name,
        code: room.code,
        ownerName: room.ownerName,
        isPrivate: room.isPrivate,
        createdAt: room.createdAt,
      },
    });
  } catch (err) {
    console.error("Get room error:", err);
    res.status(500).json({ error: "Server error fetching room details." });
  }
});

// @route   GET /api/rooms
// @desc    List available public rooms
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find({ isPrivate: false })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("name code ownerName createdAt");

    res.json({ rooms });
  } catch (err) {
    console.error("List rooms error:", err);
    res.status(500).json({ error: "Server error fetching rooms." });
  }
});

module.exports = router;
