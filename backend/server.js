const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Limits Claude API calls to 10 per hour per IP
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limit reached. Max 10 AI requests per hour during beta." }
});

// Only your Vercel frontend can call this server
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

// Health check — Railway uses this to confirm server is alive
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "EasyJob API is running",
    timestamp: new Date().toISOString()
  });
});

// Main Claude API route
app.post("/api/chat", aiLimiter, async (req, res) => {
  const { messages, system, max_tokens = 1000 } = req.body;

  // Validate messages exist
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array is required" });
  }

  // Prevent conversation stuffing
  if (messages.length > 20) {
    return res.status(400).json({ error: "Too many messages" });
  }

  // Validate each message
  for (const msg of messages) {
    if (!["user", "assistant"].includes(msg.role)) {
      return res.status(400).json({ error: "Invalid message role" });
    }
    if (typeof msg.content === "string" && msg.content.length > 10000) {
      return res.status(400).json({ error: "Message too long. Max 10,000 characters." });
    }
  }

  // Cap tokens so frontend can't request unlimited Claude output
  const safeMaxTokens = Math.min(max_tokens, 2000);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: safeMaxTokens,
        system,
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Anthropic API error"
      });
    }

    res.json(data);

  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: "Internal server error. Please try again." });
  }
});

// Catch undefined routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`EasyJob server running on port ${PORT}`);
});

module.exports = app;