// routes/ice-token.js
const express = require("express");
const router = express.Router();
const twilio = require("twilio");
const dotenv = require("dotenv");
dotenv.config();

const wname = process.env.name || "ACbfbcd7cc29b74bb224f2fcf49e659126";
const lname = process.env.sirname || "ebebe860eefe269cc263225f6ea0bda6";
let client;
try {
  client = twilio(wname, lname);
  console.log("Twilio client initialized with SID:", wname);
} catch (e) {
  console.warn("Twilio client initialization warning:", e.message);
}

router.get("/", async (req, res) => {
  try {
    if (!client) {
      return res.json({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
    }
    const token = await client.tokens.create();
    console.log("ICE Servers retrieved from Twilio");
    res.json({ iceServers: token.iceServers });
  } catch (err) {
    console.error("Error generating ICE token, falling back to public STUN:", err.message);
    res.json({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  }
});

module.exports = router;
