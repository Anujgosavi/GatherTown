// routes/ice-token.js
const express = require("express");
const router = express.Router();

// Fallback high-performance Google STUN + free global Open Relay TURN servers
const getFallbackIceServers = () => [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:openrelay.metered.ca:80" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

router.get("/", async (req, res) => {
  try {
    // 1. Check if Metered.ca credentials are configured
    const meteredApp = process.env.METERED_APP_NAME;
    const meteredKey = process.env.METERED_API_KEY;
    if (meteredApp && meteredKey) {
      try {
        const response = await fetch(
          `https://${meteredApp}.metered.live/api/v1/turn/credentials?apiKey=${meteredKey}`
        );
        if (response.ok) {
          const iceServers = await response.json();
          if (Array.isArray(iceServers) && iceServers.length > 0) {
            return res.json({ iceServers });
          }
        }
      } catch (e) {
        console.warn("Metered TURN fetch failed, falling back:", e.message);
      }
    }

    // 2. Check if Twilio is explicitly configured
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    if (twilioSid && twilioToken) {
      try {
        const twilio = require("twilio");
        const client = twilio(twilioSid, twilioToken);
        const token = await client.tokens.create();
        if (token && token.iceServers) {
          return res.json({ iceServers: token.iceServers });
        }
      } catch (e) {
        console.warn("Twilio ICE token creation failed, falling back:", e.message);
      }
    }

    // 3. Check if custom TURN credentials are provided
    if (process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      const urls = process.env.TURN_URLS.split(",").map((u) => u.trim());
      return res.json({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          {
            urls,
            username: process.env.TURN_USERNAME,
            credential: process.env.TURN_CREDENTIAL,
          },
        ],
      });
    }

    // 4. Default: Google STUN + Open Relay public TURN
    return res.json({ iceServers: getFallbackIceServers() });
  } catch (err) {
    console.error("ICE Token route error:", err);
    res.json({ iceServers: getFallbackIceServers() });
  }
});

module.exports = router;
