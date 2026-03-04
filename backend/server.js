const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
require("dotenv").config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "10mb" }));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["POST", "GET"],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Resume Match Engine API is running 🚀",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/chat", async (req, res) => {
  const { messages, system, max_tokens = 1000 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured on server" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":       "application/json",
        "x-api-key":          apiKey,
        "anthropic-version":  "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({
        error: errorData.error?.message || "Anthropic API error",
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: "Internal server error. Please try again." });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;