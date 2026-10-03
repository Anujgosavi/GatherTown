// routes/ice-token.js
const express = require("express");
const router = express.Router();

// Google public high-speed STUN servers (free, reliable, zero-latency, no expiration)
const publicIceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

router.get("/", (req, res) => {
  res.json({ iceServers: publicIceServers });
});

module.exports = router;
