import { useState, useRef, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

async function callClaude(messages, systemPrompt) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      system: systemPrompt,
      max_tokens: 1000,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  const data = await res.json();
  return data.content?.map((b) => b.text || "").join("") || "";
}

function saveProfile(profile) {
  try {
    localStorage.setItem("rme-user-profile", JSON.stringify(profile));
    return true;
  } catch (e) {
    return false;
  }
}

function loadProfile() {
  try {
    const raw = localStorage.getItem("rme-user-profile");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearProfile() {
  localStorage.removeItem("rme-user-profile");
}

const PHASE = {
  LOADING: "loading",
  PROFILE: "profile",
  HOME: "home",
  JD: "jd",
  SKILLS: "skills",
  REC: "rec",
  RESUME: "resume",
  ATS: "ats",
  CL: "cl",
};

const FLOW_STEPS = [
  { key: "jd",     label: "Job Description", icon: "01" },
  { key: "skills", label: "Skill Assessment", icon: "02" },
  { key: "rec",    label: "Recommendation",  icon: "03" },
  { key: "resume", label: "Tailored Resume",  icon: "04" },
  { key: "ats",    label: "ATS Review",       icon: "05" },
  { key: "cl",     label: "Cover Letter",     icon: "06" },
];

const P = {
  jdAnalysis: (jd) => ({
    sys: `You are a senior talent acquisition specialist with 15+ years recruiting across tech, finance, and consulting. You decode job descriptions to identify what hiring managers ACTUALLY want vs what they wrote.`,
    msg: `Analyze this job description and extract the 7–9 most critical skills. Prioritize skills that appear multiple times, are in requirements (not nice-to-have), or are central to the role.

Job Description:
${jd}

Respond ONLY in valid JSON, no markdown:
{
  "jobTitle": "exact job title",
  "company": "company name or Unknown",
  "seniorityLevel": "Junior/Mid/Senior/Lead/Director",
  "skills": ["Skill 1", "Skill 2", ...],
  "roleType": "technical/business/creative/hybrid",
  "topPriority": "single most important skill"
}`,
  }),

  recommendation: (jd, m, skillSummary) => ({
    sys: `You are a candid career coach who has helped 500+ professionals land jobs. You give honest assessments — not false hope, not unnecessary discouragement.`,
    msg: `Evaluate candidate fit and give a direct, actionable recommendation.

TARGET: ${m.jobTitle} (${m.seniority}) at ${m.company}
JD EXCERPT: ${jd.substring(0, 900)}
SELF-ASSESSED SKILLS: ${skillSummary}

## Verdict
✅ Apply with Confidence | ⚡ Apply Strategically | ⚠️ Consider Before Applying
Follow with a 2-sentence bottom-line.

## Match Score
X/100 — 1-sentence explanation.

## Your Strongest Assets
3 specific strengths for THIS role.

## Gaps to Address
3 gaps with: dealbreaker or coachable?

## Action Plan
2–3 specific steps to maximize chances.`,
  }),

  resumeTailor: (jd, m, background, skillSummary) => ({
    sys: `You are a FAANG-level resume strategist who has reviewed 10,000+ resumes. Known for: (1) ruthless ATS keyword optimization, (2) achievement-driven language, (3) honest framing without fabrication.

PRINCIPLES:
- Every bullet answers "so what?" with a metric or clear outcome
- Use EXACT language from JD for ATS matching
- Summary: 3-sentence executive pitch tailored to THIS role
- Lead each job with the most impressive/relevant achievement`,
    msg: `Create a fully tailored, ATS-optimized resume.

TARGET: ${m.jobTitle} (${m.seniority}, ${m.roleType}) at ${m.company}
TOP PRIORITY SKILL: ${m.topPriority}
JD: ${jd.substring(0, 1000)}
CANDIDATE BACKGROUND: ${background}
SKILL LEVELS: ${skillSummary}

- Open with a punchy 3-sentence Professional Summary laser-focused on THIS role
- Tailor every bullet to echo JD language
- Mark estimated metrics as [X%] or [N+]
- Skills section must include ALL high-priority JD keywords
- Use ## for section headers

Start with candidate name placeholder.`,
  }),

  resumeChat: (jd, m, resume, msg, history) => ({
    sys: `You are a surgical resume editor. Make targeted, precise edits. Explain briefly what changed. Always maintain ATS optimization.`,
    msg: `Refine this resume for ${m.jobTitle} at ${m.company}.

JD CONTEXT: ${jd.substring(0, 400)}
CURRENT RESUME: ${resume}
REQUEST: "${msg}"
${history.length ? `RECENT HISTORY:\n${history.slice(-3).map((h) => `${h.role}: ${h.content.substring(0, 100)}`).join("\n")}` : ""}

Respond with:
1. The COMPLETE updated resume
2. After "---CHANGES---", briefly note what changed and why.`,
  }),

  atsReview: (jd, m, resume) => ({
    sys: `You play TWO roles simultaneously:
ROLE 1 — ATS SYSTEM: Mechanical keyword/format scanner. Score ruthlessly.
ROLE 2 — HIRING MANAGER: ${m.seniority} HM at ${m.company}. Tired, skeptical, 7-second initial scan.`,
    msg: `Review this resume from both lenses.

TARGET: ${m.jobTitle} (${m.seniority}) at ${m.company}
JD: ${jd.substring(0, 800)}
RESUME: ${resume}

## ATS Score: X/100
2-sentence rationale.

## Keyword Analysis
**Present ✅:** JD keywords found
**Missing ❌:** Critical JD keywords absent

## Hiring Manager First Impression
Honest 7-second scan reaction.

## Top 5 Critical Fixes
Numbered, SPECIFIC.

## Shortlist Probability
A/B/C/D grade + explanation.`,
  }),

  coverLetter: (jd, m, resume, rec) => ({
    sys: `You write exceptional cover letters. Formula:
- Para 1 (Hook): Candidate's strongest achievement OR insight about company. Never "I am excited to apply."
- Para 2 (Why You): 2–3 concrete experiences tied to top requirements. Use metrics.
- Para 3 (Why Them): One specific, genuine reason this role aligns with their direction.
- Para 4 (Close): Confident, brief, direct ask.`,
    msg: `Write a compelling, personalized cover letter.

TARGET: ${m.jobTitle} (${m.seniority}) at ${m.company}
JD: ${jd.substring(0, 900)}
RESUME: ${resume.substring(0, 1200)}
POSITIONING: ${rec.substring(0, 400)}

No generic openers. Every sentence specific to this role. ~300 words. Include [Your Name] and [Date] placeholders.`,
  }),

  clChat: (m, letter, msg) => ({
    sys: `You are a precise cover letter editor. Make targeted edits. Never make it generic.`,
    msg: `Refine this cover letter for ${m.jobTitle} at ${m.company}.

CURRENT LETTER: ${letter}
REQUEST: "${msg}"

Respond with:
1. COMPLETE updated cover letter
2. After "---CHANGES---", note what changed.`,
  }),
};

function Spinner() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--a)", display: "block", animation: `pulse 1.1s ease ${i * 0.18}s infinite` }} />
      ))}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary", small }) {
  const base = {
    border: "none", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700, fontFamily: "var(--fb)", letterSpacing: "0.02em",
    transition: "all 0.15s", opacity: disabled ? 0.45 : 1,
    padding: small ? "0.5rem 1rem" : "0.75rem 1.5rem",
    fontSize: small ? "0.78rem" : "0.85rem",
  };
  if (variant === "primary") return <button style={{ ...base, background: "linear-gradient(135deg,var(--a),#60a5fa)", color: "#0b1120" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "ghost") return <button style={{ ...base, background: "rgba(255,255,255,0.05)", border: "1px solid var(--br)", color: "rgba(255,255,255,0.5)" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "teal") return <button style={{ ...base, background: "linear-gradient(135deg,#0d9488,#0284c7)", color: "#fff" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "danger") return <button style={{ ...base, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Card({ children, style: sx }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--br)", borderRadius: 16, padding: "1.6rem", animation: "fadeUp 0.35s ease forwards", ...sx }}>
      {children}
    </div>
  );
}

function CardTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: "1.2rem" }}>
      <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: "0 0 0.2rem" }}>{children}</h2>
      {sub && <p style={{ color: "var(--mu)", fontSize: "0.78rem", margin: 0 }}>{sub}</p>}
    </div>
  );
}

function TA({ value, onChange, placeholder, rows = 8 }) {
  return (
    <textarea style={{
      width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)",
      border: "1px solid var(--br)", borderRadius: 10, padding: "0.85rem",
      color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", lineHeight: 1.65,
      resize: "vertical", outline: "none", minHeight: `${rows * 22}px`, transition: "border-color 0.2s",
    }}
      placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => (e.target.style.borderColor = "rgba(99,212,170,0.5)")}
      onBlur={(e) => (e.target.style.borderColor = "var(--br)")}
    />
  );
}

function MD({ text }) {
  if (!text) return null;
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^## (.+)$/gm, `<h2 style="color:#fff;font-size:0.98rem;margin:1.1rem 0 0.3rem;font-family:var(--fd)">$1</h2>`)
    .replace(/^### (.+)$/gm, `<h3 style="color:var(--a);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.07em;margin:0.9rem 0 0.2rem">$1</h3>`)
    .replace(/^\d+\. (.+)$/gm, `<div style="display:flex;gap:8px;margin:4px 0;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:6px;border-left:2px solid rgba(99,212,170,0.35)"><span>$1</span></div>`)
    .replace(/^- (.+)$/gm, `<div style="display:flex;gap:8px;margin:3px 0"><span style="color:var(--a);margin-top:2px">▸</span><span>$1</span></div>`)
    .replace(/\n\n/g, "<br/><br/>").replace(/\n/g, "<br/>");
  return <div style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.72, fontSize: "0.87rem" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function PreBox({ text }) {
  return (
    <pre style={{
      whiteSpace: "pre-wrap", wordBreak: "break-word",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      fontSize: "0.77rem", lineHeight: 1.75, color: "rgba(255,255,255,0.8)",
      background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12, padding: "1.25rem", maxHeight: 380, overflowY: "auto", margin: 0,
    }}>{text}</pre>
  );
}

function SkillRow({ skill, rating, onChange, isTop }) {
  const lbl = ["", "Novice", "Learning", "Proficient", "Advanced", "Expert"];
  const clr = [, "#f87171", "#fb923c", "#fbbf24", "#4ade80", "var(--a)"];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap",
      padding: "0.75rem 1rem", borderRadius: 10, marginBottom: "0.45rem",
      background: rating ? "rgba(99,212,170,0.04)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${rating ? "rgba(99,212,170,0.2)" : "rgba(255,255,255,0.06)"}`,
      transition: "all 0.2s",
    }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 120 }}>
        {isTop && <span style={{ fontSize: "0.65rem", color: "#fbbf24" }}>★</span>}
        <span style={{ color: "rgba(255,255,255,0.88)", fontSize: "0.86rem" }}>{skill}</span>
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)} style={{
            width: 30, height: 30, borderRadius: 7, border: "none", cursor: "pointer",
            background: rating >= n ? clr[n] : "rgba(255,255,255,0.07)",
            color: rating >= n ? "#0b1120" : "rgba(255,255,255,0.3)",
            fontWeight: 700, fontSize: "0.77rem", transition: "all 0.12s",
            transform: rating === n ? "scale(1.15)" : "scale(1)",
          }}>{n}</button>
        ))}
        {rating > 0 && <span style={{ fontSize: "0.67rem", color: clr[rating], fontWeight: 600, minWidth: 60, marginLeft: 4 }}>{lbl[rating]}</span>}
      </div>
    </div>
  );
}

function FlowStepper({ current }) {
  const idx = FLOW_STEPS.findIndex((s) => s.key === current);
  return (
    <div style={{ display: "flex", marginBottom: "1.75rem" }}>
      {FLOW_STEPS.map((s, i) => {
        const done = i < idx, active = i === idx;
        return (
          <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
              {i > 0 && <div style={{ flex: 1, height: 2, background: done ? "var(--a)" : "rgba(255,255,255,0.07)", transition: "background 0.4s" }} />}
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: done ? "var(--a)" : active ? "rgba(99,212,170,0.12)" : "rgba(255,255,255,0.04)",
                border: `2px solid ${done ? "var(--a)" : active ? "var(--a)" : "rgba(255,255,255,0.1)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.6rem", fontWeight: 800,
                color: done ? "#0b1120" : active ? "var(--a)" : "rgba(255,255,255,0.25)",
                boxShadow: active ? "0 0 12px rgba(99,212,170,0.3)" : "none", transition: "all 0.3s",
              }}>{done ? "✓" : s.icon}</div>
              {i < FLOW_STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "var(--a)" : "rgba(255,255,255,0.07)", transition: "background 0.4s" }} />}
            </div>
            <span style={{
              fontSize: "0.52rem", marginTop: "0.3rem", letterSpacing: "0.06em",
              textTransform: "uppercase", textAlign: "center",
              color: active ? "var(--a)" : done ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)",
              fontWeight: active ? 700 : 400,
            }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreDial({ score }) {
  const r = 36, c = 2 * Math.PI * r, pct = Math.min(100, Math.max(0, score));
  const col = pct >= 75 ? "var(--a)" : pct >= 55 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
      <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} style={{ transition: "stroke-dasharray 0.8s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--fd)", fontSize: "1.35rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>{pct}</span>
        <span style={{ fontSize: "0.55rem", color: "var(--mu)", letterSpacing: "0.05em" }}>/100</span>
      </div>
    </div>
  );
}

function ChatPanel({ messages, onSend, loading, placeholder }) {
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  function send() { if (!input.trim() || loading) return; onSend(input.trim()); setInput(""); }
  return (
    <div style={{ background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, marginTop: "1rem", overflow: "hidden" }}>
      <div style={{ padding: "0.55rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <span style={{ fontSize: "0.72rem", color: "var(--a)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>✦ Chat-Refine</span>
        <span style={{ fontSize: "0.68rem", color: "var(--mu)" }}>— ask Claude to tweak anything</span>
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto", padding: "0.7rem 1rem" }}>
        {messages.length === 0 && <div style={{ color: "var(--mu)", fontSize: "0.78rem", fontStyle: "italic" }}>{placeholder}</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: "0.45rem" }}>
            <div style={{
              maxWidth: "80%", padding: "0.5rem 0.8rem",
              borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: m.role === "user" ? "rgba(99,212,170,0.12)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${m.role === "user" ? "rgba(99,212,170,0.2)" : "rgba(255,255,255,0.06)"}`,
              color: "rgba(255,255,255,0.85)", fontSize: "0.79rem", lineHeight: 1.55,
            }}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={{ display: "flex", gap: 5, padding: "4px 0" }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--a)", display: "block", animation: `pulse 1.1s ease ${i * 0.18}s infinite` }} />)}</div>}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.55rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <input style={{
          flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, padding: "0.5rem 0.75rem", color: "#fff", fontSize: "0.8rem",
          fontFamily: "var(--fb)", outline: "none",
        }} placeholder="Type your refinement..." value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()} />
        <button onClick={send} disabled={loading || !input.trim()} style={{
          background: (!loading && input.trim()) ? "var(--a)" : "rgba(99,212,170,0.1)", border: "none",
          borderRadius: 8, padding: "0 1rem",
          color: (!loading && input.trim()) ? "#0b1120" : "rgba(255,255,255,0.25)",
          cursor: (!loading && input.trim()) ? "pointer" : "not-allowed",
          fontWeight: 700, fontSize: "0.8rem", transition: "all 0.15s",
        }}>Send</button>
      </div>
    </div>
  );
}

function ProfileBanner({ profile, onEdit }) {
  const preview = profile.background.substring(0, 120).replace(/\n/g, " ");
  return (
    <div style={{
      background: "rgba(99,212,170,0.05)", border: "1px solid rgba(99,212,170,0.2)",
      borderRadius: 12, padding: "0.85rem 1.1rem", marginBottom: "1.5rem",
      display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
          <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--a)" }}>✓ Profile Loaded</span>
          {profile.name && <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>· {profile.name}</span>}
        </div>
        <p style={{ color: "var(--mu)", fontSize: "0.75rem", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {preview}…
        </p>
      </div>
      <button onClick={onEdit} style={{
        background: "rgba(255,255,255,0.07)", border: "1px solid var(--br)", borderRadius: 8,
        padding: "0.4rem 0.85rem", color: "rgba(255,255,255,0.6)", fontSize: "0.75rem",
        cursor: "pointer", fontFamily: "var(--fb)", fontWeight: 600, whiteSpace: "nowrap",
      }}>✏ Edit Profile</button>
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState(PHASE.LOADING);
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftBG, setDraftBG] = useState("");
  const [jd, setJd] = useState("");
  const [meta, setMeta] = useState({ jobTitle: "", company: "", seniority: "", roleType: "", topPriority: "" });
  const [skills, setSkills] = useState([]);
  const [ratings, setRatings] = useState({});
  const [recommendation, setRec] = useState("");
  const [resume, setResume] = useState("");
  const [resumeChat, setResumeChat] = useState([]);
  const [atsReview, setAtsReview] = useState("");
  const [atsScore, setAtsScore] = useState(null);
  const [coverLetter, setCL] = useState("");
  const [clChat, setClChat] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [phase, loading]);

  useEffect(() => {
    const p = loadProfile();
    if (p) { setProfile(p); setPhase(PHASE.HOME); }
    else { setPhase(PHASE.PROFILE); }
  }, []);

  const skillSummary = skills.map((s) => `${s}: ${ratings[s] || "?"}/5`).join(", ");

  async function apiCall(promptFn, ...args) {
    const { sys, msg } = promptFn(...args);
    return await callClaude([{ role: "user", content: msg }], sys);
  }

  function saveAndContinue() {
    if (!draftBG.trim()) return;
    const p = { name: draftName.trim(), background: draftBG.trim() };
    setProfile(p); saveProfile(p); setEditingProfile(false); setPhase(PHASE.HOME);
  }

  function startEditProfile() {
    setDraftName(profile?.name || ""); setDraftBG(profile?.background || ""); setEditingProfile(true);
  }

  function startNewJob() {
    setJd(""); setMeta({ jobTitle: "", company: "", seniority: "", roleType: "", topPriority: "" });
    setSkills([]); setRatings({}); setRec(""); setResume("");
    setResumeChat([]); setAtsReview(""); setAtsScore(null); setCL(""); setClChat([]);
    setError(""); setPhase(PHASE.JD);
  }

  async function analyzeJD() {
    if (!jd.trim()) return;
    setLoading(true); setError("");
    try {
      const raw = await apiCall(P.jdAnalysis, jd);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setSkills(parsed.skills || []);
      setMeta({ jobTitle: parsed.jobTitle || "", company: parsed.company || "", seniority: parsed.seniorityLevel || "", roleType: parsed.roleType || "", topPriority: parsed.topPriority || "" });
      setPhase(PHASE.SKILLS);
    } catch (e) { setError("Couldn't parse the job description. Please try again."); }
    setLoading(false);
  }

  async function getRecommendation() {
    if (skills.some((s) => !ratings[s])) { setError("Please rate all skills."); return; }
    setLoading(true); setError("");
    const res = await apiCall(P.recommendation, jd, meta, skillSummary);
    setRec(res); setPhase(PHASE.REC); setLoading(false);
  }

  async function tailorResume() {
    setLoading(true); setError("");
    const res = await apiCall(P.resumeTailor, jd, meta, profile.background, skillSummary);
    setResume(res); setResumeChat([]); setPhase(PHASE.RESUME); setLoading(false);
  }

  async function refineResume(userMsg) {
    setChatLoading(true);
    const hist = [...resumeChat, { role: "user", content: userMsg }];
    setResumeChat(hist);
    const res = await apiCall(P.resumeChat, jd, meta, resume, userMsg, resumeChat);
    const [updated, note] = res.split("---CHANGES---");
    if (updated?.trim()) setResume(updated.trim());
    setResumeChat([...hist, { role: "assistant", content: note?.trim() || "Resume updated ✓" }]);
    setChatLoading(false);
  }

  async function runATS() {
    setLoading(true); setError("");
    const res = await apiCall(P.atsReview, jd, meta, resume);
    const m = res.match(/ATS Score:\s*(\d+)\/100/i);
    if (m) setAtsScore(parseInt(m[1]));
    setAtsReview(res); setPhase(PHASE.ATS); setLoading(false);
  }

  async function generateCL() {
    setLoading(true); setError("");
    const res = await apiCall(P.coverLetter, jd, meta, resume, recommendation);
    setCL(res); setClChat([]); setPhase(PHASE.CL); setLoading(false);
  }

  async function refineCL(userMsg) {
    setChatLoading(true);
    const hist = [...clChat, { role: "user", content: userMsg }];
    setClChat(hist);
    const res = await apiCall(P.clChat, meta, coverLetter, userMsg);
    const [updated, note] = res.split("---CHANGES---");
    if (updated?.trim()) setCL(updated.trim());
    setClChat([...hist, { role: "assistant", content: note?.trim() || "Cover letter updated ✓" }]);
    setChatLoading(false);
  }

  const inFlow = [PHASE.JD, PHASE.SKILLS, PHASE.REC, PHASE.RESUME, PHASE.ATS, PHASE.CL].includes(phase);

  return (
    <div style={{
      "--a": "#63d4aa", "--card": "rgba(255,255,255,0.027)", "--br": "rgba(255,255,255,0.08)",
      "--mu": "rgba(255,255,255,0.38)", "--fd": "'Syne',sans-serif", "--fb": "'DM Sans',sans-serif",
      minHeight: "100vh", fontFamily: "var(--fb)", padding: "2rem 1rem",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,80%,100%{transform:translateY(0);opacity:0.6} 40%{transform:translateY(-7px);opacity:1} }
        input::placeholder, textarea::placeholder { color:rgba(255,255,255,0.22) }
      `}</style>
      <div style={{ maxWidth: 740, margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: "2.2rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(99,212,170,0.08)", border: "1px solid rgba(99,212,170,0.18)", borderRadius: 20, padding: "3px 12px", marginBottom: "0.9rem" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--a)", display: "block", boxShadow: "0 0 8px var(--a)", animation: "pulse 2.5s infinite" }} />
            <span style={{ color: "var(--a)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>AI-Powered · v3.0</span>
          </div>
          <h1 style={{ fontFamily: "var(--fd)", fontSize: "clamp(1.8rem,5vw,2.6rem)", fontWeight: 800, color: "#fff", margin: "0 0 0.4rem", lineHeight: 1.1 }}>
            Resume &amp; Job<br />
            <span style={{ background: "linear-gradient(130deg,var(--a) 20%,#60a5fa 80%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Match Engine</span>
          </h1>
          <p style={{ color: "var(--mu)", fontSize: "0.84rem", margin: 0 }}>One profile. Unlimited job applications.</p>
        </header>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#f87171", fontSize: "0.82rem" }}>⚠️ {error}</span>
            <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "1rem" }}>×</button>
          </div>
        )}

        {phase === PHASE.LOADING && <div style={{ textAlign: "center", padding: "3rem 0" }}><Spinner /></div>}

        {(phase === PHASE.PROFILE || editingProfile) && (
          <Card>
            <CardTitle children={editingProfile ? "Edit Your Profile" : "Welcome! Set up your profile"}
              sub={editingProfile ? "Update your background — saved and reused across all applications." : "You only do this once. Your background is saved and reused for every job application."} />
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.4rem" }}>Your Name (optional)</label>
              <input style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid var(--br)", borderRadius: 10, padding: "0.75rem", color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", outline: "none" }}
                placeholder="e.g. Alex Johnson" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </div>
            <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.4rem" }}>Your Background & Resume *</label>
            <TA value={draftBG} onChange={setDraftBG} rows={13}
              placeholder={`Paste your current resume, or describe your background:\n\n• Work experience (company, role, dates, key achievements)\n• Education & certifications\n• Technical skills & tools\n• Projects, publications, notable wins`} />
            <div style={{ marginTop: "1.1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {editingProfile ? (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Btn variant="ghost" onClick={() => setEditingProfile(false)}>Cancel</Btn>
                  <Btn variant="danger" onClick={() => { clearProfile(); setProfile(null); setEditingProfile(false); setPhase(PHASE.PROFILE); }}>🗑 Clear Profile</Btn>
                </div>
              ) : <div />}
              <Btn onClick={saveAndContinue} disabled={!draftBG.trim()}>{editingProfile ? "Save Changes →" : "Save Profile & Start →"}</Btn>
            </div>
          </Card>
        )}

        {phase === PHASE.HOME && !editingProfile && (
          <div style={{ animation: "fadeUp 0.35s ease forwards" }}>
            <ProfileBanner profile={profile} onEdit={startEditProfile} />
            <Card>
              <div style={{ textAlign: "center", padding: "1rem 0 0.5rem" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎯</div>
                <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.3rem", color: "#fff", margin: "0 0 0.5rem" }}>
                  Okay {profile?.name ? profile.name.split(" ")[0] : "there"}, which job are you eyeing?
                </h2>
                <p style={{ color: "var(--mu)", fontSize: "0.85rem", margin: "0 0 1.75rem" }}>
                  Paste a job description and I'll assess your fit, tailor your resume, review it against ATS, and draft your cover letter.
                </p>
                <Btn onClick={startNewJob}>Paste a Job Description →</Btn>
              </div>
            </Card>
          </div>
        )}

        {inFlow && !editingProfile && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", padding: "0.6rem 0.9rem", background: "rgba(99,212,170,0.04)", border: "1px solid rgba(99,212,170,0.15)", borderRadius: 10, flexWrap: "wrap", gap: "0.5rem" }}>
              <span style={{ color: "var(--a)", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                ✓ Using profile{profile?.name ? `: ${profile.name}` : ""}
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={startEditProfile} style={{ background: "none", border: "1px solid var(--br)", borderRadius: 6, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer", fontFamily: "var(--fb)" }}>✏ Edit</button>
                <button onClick={() => setPhase(PHASE.HOME)} style={{ background: "none", border: "1px solid var(--br)", borderRadius: 6, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer", fontFamily: "var(--fb)" }}>← Home</button>
              </div>
            </div>
            <FlowStepper current={phase} />
          </>
        )}

        {phase === PHASE.JD && !editingProfile && (
          <Card>
            <CardTitle children="Paste the Job Description" sub="Include the full JD for the most accurate skill extraction and analysis." />
            <TA value={jd} onChange={setJd} rows={11} placeholder="Paste the full job description here..." />
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1rem", marginTop: "1rem" }}>
              {loading && <Spinner />}
              <Btn onClick={analyzeJD} disabled={loading || !jd.trim()}>{loading ? "Analyzing..." : "Extract Skills & Analyze →"}</Btn>
            </div>
          </Card>
        )}

        {phase === PHASE.SKILLS && !editingProfile && (
          <Card>
            <CardTitle children="Rate Your Skills"
              sub={`${meta.jobTitle}${meta.seniority ? ` · ${meta.seniority}` : ""} at ${meta.company} — Be honest, this drives your recommendation.`} />
            {meta.topPriority && (
              <div style={{ padding: "0.55rem 0.85rem", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, marginBottom: "1rem", fontSize: "0.76rem", color: "rgba(251,191,36,0.9)" }}>
                ★ <strong>Top priority skill for this role:</strong> {meta.topPriority}
              </div>
            )}
            {skills.map((s) => (
              <SkillRow key={s} skill={s} rating={ratings[s] || 0} onChange={(v) => setRatings((r) => ({ ...r, [s]: v }))} isTop={s === meta.topPriority} />
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.1rem" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.JD)}>← Back</Btn>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={getRecommendation} disabled={loading || skills.some((s) => !ratings[s])}>{loading ? "Assessing..." : "Get Recommendation →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {phase === PHASE.REC && !editingProfile && (
          <Card>
            <CardTitle children="Your Application Recommendation" />
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "1.1rem", marginBottom: "1.1rem" }}><MD text={recommendation} /></div>
            <div style={{ padding: "0.7rem 1rem", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.14)", borderRadius: 9, marginBottom: "1.1rem" }}>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.77rem", margin: 0 }}>💡 Your saved profile will be used automatically to generate the tailored resume.</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.SKILLS)}>← Adjust Ratings</Btn>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={tailorResume} disabled={loading}>{loading ? "Generating Resume..." : "Tailor My Resume →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {phase === PHASE.RESUME && !editingProfile && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: 0 }}>Tailored Resume</h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <span style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa", fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{meta.jobTitle}</span>
                <button onClick={() => navigator.clipboard.writeText(resume)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--br)", borderRadius: 7, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer" }}>📋 Copy</button>
              </div>
            </div>
            <PreBox text={resume} />
            <ChatPanel messages={resumeChat} onSend={refineResume} loading={chatLoading} placeholder='Try: "make it more concise", "emphasize leadership", "stronger summary"...' />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.1rem" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.REC)}>← Back</Btn>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={runATS} disabled={loading}>{loading ? "Reviewing..." : "Run ATS + HM Review →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {phase === PHASE.ATS && !editingProfile && (
          <>
            {atsScore !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", background: "var(--card)", border: "1px solid var(--br)", borderRadius: 16, padding: "1.2rem 1.4rem", marginBottom: "1rem", animation: "fadeUp 0.35s ease forwards", flexWrap: "wrap" }}>
                <ScoreDial score={atsScore} />
                <div>
                  <div style={{ fontFamily: "var(--fd)", fontSize: "1.15rem", fontWeight: 800, color: "#fff", marginBottom: "0.2rem" }}>
                    ATS Score: {atsScore >= 75 ? "🟢 Strong Pass" : atsScore >= 55 ? "🟡 Borderline" : "🔴 High Risk"}
                  </div>
                  <div style={{ color: "var(--mu)", fontSize: "0.78rem" }}>
                    {atsScore >= 75 ? "Well-optimized — likely to pass most automated filters." : atsScore >= 55 ? "Will pass some ATS systems. Key improvements recommended." : "High risk of automated rejection. Revision needed."}
                  </div>
                </div>
              </div>
            )}
            <Card>
              <CardTitle children="ATS & Hiring Manager Review" />
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "1.1rem" }}><MD text={atsReview} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Btn variant="ghost" onClick={() => setPhase(PHASE.HOME)}>🏠 Home</Btn>
                  <Btn variant="ghost" onClick={() => setPhase(PHASE.RESUME)}>← Resume</Btn>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {loading && <Spinner />}
                  <Btn variant="teal" onClick={generateCL} disabled={loading}>{loading ? "Writing..." : "✉ Generate Cover Letter →"}</Btn>
                </div>
              </div>
            </Card>
          </>
        )}

        {phase === PHASE.CL && !editingProfile && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: 0 }}>Cover Letter</h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <span style={{ background: "rgba(99,212,170,0.1)", border: "1px solid rgba(99,212,170,0.22)", color: "var(--a)", fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{meta.company}</span>
                <button onClick={() => navigator.clipboard.writeText(coverLetter)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--br)", borderRadius: 7, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer" }}>📋 Copy</button>
              </div>
            </div>
            <PreBox text={coverLetter} />
            <ChatPanel messages={clChat} onSend={refineCL} loading={chatLoading} placeholder='Try: "bolder opening", "shorter overall", "more focus on leadership"...' />
            <div style={{ marginTop: "1.1rem", padding: "0.75rem 1rem", background: "rgba(99,212,170,0.06)", border: "1px solid rgba(99,212,170,0.18)", borderRadius: 9 }}>
              <p style={{ color: "var(--a)", fontSize: "0.78rem", fontWeight: 600, margin: "0 0 0.2rem" }}>✓ Application package complete!</p>
              <p style={{ color: "var(--mu)", fontSize: "0.75rem", margin: 0 }}>
                Resume + Cover Letter tailored for <strong style={{ color: "rgba(255,255,255,0.7)" }}>{meta.jobTitle}</strong> at <strong style={{ color: "rgba(255,255,255,0.7)" }}>{meta.company}</strong>. Your profile is saved — start the next one from Home.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.ATS)}>← ATS Review</Btn>
              <Btn onClick={() => setPhase(PHASE.HOME)}>🏠 Back to Home →</Btn>
            </div>
          </Card>
        )}

        <div ref={bottomRef} />
        <p style={{ textAlign: "center", marginTop: "2rem", color: "rgba(255,255,255,0.1)", fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Resume Match Engine · v3.0 · Powered by Claude AI
        </p>
      </div>
    </div>
  );
}