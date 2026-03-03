# 🎯 Resume & Job Match Engine

> Enter your background once. Get a fitment check, tailored resume, ATS review, and a personalized cover letter — all in one flow, powered by Claude AI.

## ✨ Features
- **Persistent Profile** — Enter your background once, reused for every application
- **Smart JD Analysis** — Extracts 7–9 critical skills from any job description
- **Honest Fit Assessment** — Self-rate skills and get a clear Apply / Don't Apply recommendation
- **ATS-Optimized Resume** — Tailored resume using exact JD keywords
- **Chat Refinement** — Refine resume and cover letter in natural language
- **ATS + HM Review** — Scored from both an ATS scanner and hiring manager lens
- **Cover Letter Generator** — Structured, specific, no generic openers

## 🏗 Architecture
```
[React Frontend] → [Express Backend] → [Anthropic API]
    Vercel              Railway
```

## 📁 Project Structure
```
resume-match-engine/
├── frontend/          # React + Vite app
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/           # Express API proxy
│   ├── server.js
│   └── package.json
├── .gitignore
└── README.md
```

## 🚀 Deployment
- **Frontend** → Vercel (set `VITE_API_URL` to your Railway URL)
- **Backend** → Railway (set `ANTHROPIC_API_KEY` and `FRONTEND_URL`)

## 🛠 Tech Stack
- React 18 + Vite
- Express.js
- Claude Sonnet AI
- localStorage for profile persistence
- Vercel + Railway
```

5. **Ctrl+S** to save

---

## Now Commit Everything!

1. Click the **Source Control icon** in the left sidebar (3rd icon, looks like a branch)
2. You'll see all your files listed under "Changes"
3. In the **Message** box type:
```
Add all project files — Resume Match Engine v1.0