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

// Memory cache for active Metered ICE servers
let cachedMeteredServers = null;
let cachedMeteredExpiresAt = 0;

router.get("/", async (req, res) => {
  try {
    // 1. Check if Metered credentials are configured
    const meteredDomain =
      process.env.METERED_DOMAIN ||
      process.env.METERED_APP_NAME ||
      "anujg.metered.live";
    const meteredSecret =
      process.env.METERED_SECRET_KEY ||
      process.env.METERED_API_KEY ||
      "RrUVSAd5teE9q1QI2VzlIl7M8W8nfh8jAHOP-wr9ZctPE3tT";

    if (meteredDomain && meteredSecret) {
      // Check cache first (valid for 12 hours)
      const now = Date.now();
      if (cachedMeteredServers && now < cachedMeteredExpiresAt) {
        return res.json({ iceServers: cachedMeteredServers });
      }

      const cleanApp = meteredDomain
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const host = cleanApp.includes(".") ? cleanApp : `${cleanApp}.metered.live`;

      try {
        // A) If secretKey is provided, generate fresh credentials via POST
        const postRes = await fetch(
          `https://${host}/api/v1/turn/credential?secretKey=${meteredSecret}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expiryInSeconds: 86400 }),
          }
        );

        if (postRes.ok) {
          const credData = await postRes.json();
          if (credData.apiKey) {
            // Retrieve full ICE configuration with the generated apiKey
            const credsRes = await fetch(
              `https://${host}/api/v1/turn/credentials?apiKey=${credData.apiKey}`
            );
            if (credsRes.ok) {
              const servers = await credsRes.json();
              if (Array.isArray(servers) && servers.length > 0) {
                cachedMeteredServers = servers;
                cachedMeteredExpiresAt = now + 12 * 60 * 60 * 1000;
                console.log(
                  `[ICE] Retrieved and cached ${servers.length} dedicated TURN servers from Metered`
                );
                return res.json({ iceServers: servers });
              }
            }
          }
        }

        // B) Try direct GET with apiKey as fallback
        const getRes = await fetch(
          `https://${host}/api/v1/turn/credentials?apiKey=${meteredSecret}`
        );
        if (getRes.ok) {
          const servers = await getRes.json();
          if (Array.isArray(servers) && servers.length > 0) {
            cachedMeteredServers = servers;
            cachedMeteredExpiresAt = now + 12 * 60 * 60 * 1000;
            console.log(
              `[ICE] Retrieved and cached ${servers.length} TURN servers from Metered`
            );
            return res.json({ iceServers: servers });
          }
        }
      } catch (e) {
        console.warn("Metered TURN fetch error, falling back:", e.message);
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
          console.log(`[ICE] Successfully retrieved ${token.iceServers.length} TURN servers from Twilio`);
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
