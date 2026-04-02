const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const rateLimit = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

/*
--------------------------------
SUPABASE CLIENT
--------------------------------
This connects your server to your database.
Every time you read or write user data, it goes through this client.
*/
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/*
--------------------------------
RATE LIMITERS
--------------------------------
*/
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limit reached. Max 10 AI requests per hour during beta." }
});

/*
--------------------------------
CORS — only your frontend can call this server
--------------------------------
*/
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

/*
--------------------------------
HEALTH CHECK
--------------------------------
*/
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "EasyJob API is running",
    timestamp: new Date().toISOString()
  });
});

/*
--------------------------------
SAVE USER
--------------------------------
Called when a new user signs up.
Stores their email and name in the users table.
*/
app.post("/api/users", async (req, res) => {
  const { email, full_name } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .insert([{ email, full_name }])
      .select();

    if (error) {
      // If user already exists, return them instead of erroring
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("users")
          .select()
          .eq("email", email)
          .single();
        return res.json(existing);
      }
      return res.status(400).json({ error: error.message });
    }

    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to save user" });
  }
});

/*
--------------------------------
SAVE SKILL ASSESSMENT
--------------------------------
Called after a user rates their skills.
Stores their skill scores and match score in skill_assessments table.
*/
app.post("/api/assessments", async (req, res) => {
  const { user_id, role_target, skills, match_score } = req.body;

  if (!user_id || !skills) {
    return res.status(400).json({ error: "user_id and skills are required" });
  }

  try {
    const { data, error } = await supabase
      .from("skill_assessments")
      .insert([{ user_id, role_target, skills, match_score }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to save assessment" });
  }
});

/*
--------------------------------
SAVE JOB OUTCOME
--------------------------------
Called when user reports what happened after applying.
This is your flywheel data — the most valuable thing EasyJob collects.
*/
app.post("/api/outcomes", async (req, res) => {
  const { user_id, job_title, company, match_score, outcome } = req.body;

  if (!user_id || !outcome) {
    return res.status(400).json({ error: "user_id and outcome are required" });
  }

  // outcome must be one of these 4 values only
  const validOutcomes = ["interview", "rejected", "ghosted", "offer"];
  if (!validOutcomes.includes(outcome)) {
    return res.status(400).json({ 
      error: "outcome must be: interview, rejected, ghosted, or offer" 
    });
  }

  try {
    const { data, error } = await supabase
      .from("job_outcomes")
      .insert([{ user_id, job_title, company, match_score, outcome }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to save outcome" });
  }
});

/*
--------------------------------
CHAT API — Claude AI
--------------------------------
*/
app.post("/api/chat", aiLimiter, async (req, res) => {
  const { messages, system, max_tokens = 1000 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array is required" });
  }

  if (messages.length > 20) {
    return res.status(400).json({ error: "Too many messages" });
  }

  for (const msg of messages) {
    if (!["user", "assistant"].includes(msg.role)) {
      return res.status(400).json({ error: "Invalid message role" });
    }
    if (typeof msg.content === "string" && msg.content.length > 10000) {
      return res.status(400).json({ error: "Message too long" });
    }
  }

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
    res.status(500).json({ error: "Internal server error" });
  }
});


/*
--------------------------------
JOBS API
--------------------------------
Fetches real jobs from JSearch (aggregates LinkedIn, Indeed, Glassdoor)
User sends a role and location, we return matching jobs
*/
app.get("/api/jobs", async (req, res) => {
  const { role, location } = req.query;

  if (!role) {
    return res.status(400).json({ error: "role is required" });
  }

  const query = location ? `${role} in ${location}` : role;

  try {
    const response = await fetch(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=1&num_pages=1&country=in&date_posted=month`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-host": "jsearch.p.rapidapi.com",
          "x-rapidapi-key": process.env.RAPIDAPI_KEY
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: "Jobs API error" });
    }

    // Clean the data — only send what frontend needs
    const jobs = data.data?.map(job => ({
      id: job.job_id,
      title: job.job_title,
      company: job.employer_name,
      location: job.job_city || job.job_country,
      description: job.job_description?.slice(0, 500),
      url: job.job_apply_link,
      posted: job.job_posted_at_datetime_utc
    })) || [];

    res.json({ jobs, total: jobs.length });

  } catch (error) {
    console.error("Jobs API error:", error.message);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

/*
--------------------------------
MATCH SCORE API
--------------------------------
Takes user skills + job description
Returns a match score out of 100 with reasoning
This is EasyJob's core feature
*/
app.post("/api/match", aiLimiter, async (req, res) => {
  const { skills, job_title, job_description } = req.body;

  if (!skills || !job_description) {
    return res.status(400).json({ error: "skills and job_description are required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const prompt = "You are EasyJob, an AI career coach for India's job market. A candidate has shared their skills and you must evaluate how well they match a job.\n\nCANDIDATE SKILLS:\n" + JSON.stringify(skills) + "\n\nJOB TITLE: " + job_title + "\n\nJOB DESCRIPTION:\n" + job_description.substring(0, 1000) + "\n\nRespond in this exact JSON format only, no other text:\n{\n  \"match_score\": <number 0-100>,\n  \"summary\": \"<one sentence verdict>\",\n  \"strengths\": [\"<strength 1>\", \"<strength 2>\"],\n  \"gaps\": [\"<gap 1>\", \"<gap 2>\"],\n  \"recommendation\": \"<one sentence action the candidate should take>\"\n}";

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
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || "AI error" });
    }

    const text = data.content[0].text;
    const result = JSON.parse(text);

    res.json(result);

  } catch (error) {
    console.error("Match API error:", error.message);
    res.status(500).json({ error: "Failed to generate match score" });
  }
});
/*
--------------------------------
404 HANDLER
--------------------------------
*/
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

/*
--------------------------------
START SERVER
--------------------------------
*/
app.listen(PORT, "0.0.0.0", () => {
  console.log(`EasyJob server running on port ${PORT}`);
});

module.exports = app;