import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
const [draftCompany, setDraftCompany] = useState("");
const [draftHrRole, setDraftHrRole] = useState("");

const API_BASE = import.meta.env.VITE_API_URL || "";
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "",
  import.meta.env.VITE_SUPABASE_KEY || ""
);

async function callClaude(messages, systemPrompt) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system: systemPrompt, max_tokens: 1500 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  const data = await res.json();
  return data.content?.map((b) => b.text || "").join("") || "";
}

async function fetchJobs(role, location = "India") {
  const res = await fetch(`${API_BASE}/api/jobs?role=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.jobs || [];
}

function computeMatchScore(resume, job) {
  if (!resume || !job) return 50;
  const resumeLower = resume.toLowerCase();
  const jobText = (job.title + " " + job.description).toLowerCase();
  const jobWords = jobText.split(/\W+/).filter(w => w.length > 4);
  const uniqueWords = [...new Set(jobWords)];
  let matches = 0;
  for (const word of uniqueWords) {
    if (resumeLower.includes(word)) matches++;
  }
  const score = Math.round((matches / Math.max(uniqueWords.length, 1)) * 100);
  return Math.min(95, Math.max(30, score));
}

const INTEREST_BUCKETS = [
  { id: "product", label: "Product Management", icon: "🎯" },
  { id: "consulting", label: "Consulting & Strategy", icon: "👔" },
  { id: "chief-of-staff", label: "Chief of Staff", icon: "👑" },
  { id: "fullstack", label: "Full Stack Developer", icon: "💻" },
  { id: "data-analyst", label: "Business & Data Analyst", icon: "📊" },
  { id: "marketing", label: "Marketing & Growth", icon: "📈" },
  { id: "finance", label: "Finance & Banking", icon: "🏦" },
  { id: "operations", label: "Operations & Program Mgmt", icon: "⚙️" },
  { id: "social-sector", label: "Social Sector / NGO", icon: "🌱" },
  { id: "hr", label: "Human Resources", icon: "🤝" },
];

const BUCKET_SEARCH_TERMS = {
  "product": "Product Manager",
  "consulting": "Strategy Consultant",
  "chief-of-staff": "Chief of Staff",
  "fullstack": "Full Stack Developer",
  "data-analyst": "Business Analyst",
  "marketing": "Marketing Manager",
  "finance": "Finance Analyst",
  "operations": "Operations Manager",
  "social-sector": "Program Manager NGO",
  "hr": "HR Manager",
};

const PHASE = {
  LOADING: "loading", 
  AUTH: "auth",
  ROLE_SELECT: "role_select",        // NEW — I am looking for job / I am hiring
  SETUP_INFO: "setup_info",          // Seeker — name + resume
  SETUP_BUCKETS: "setup_buckets",    // Seeker — interest buckets
  HR_SETUP: "hr_setup",             // NEW — HR onboarding
  HOME: "home",                      // Seeker home
  JD: "jd", SKILLS: "skills",
  REC: "rec", RESUME: "resume", 
  ATS: "ats", CL: "cl", 
  HR: "hr"
};

{/* ROLE SELECTION — first time users only */}
{phase === PHASE.ROLE_SELECT && (
  <div style={{ animation: "fadeUp 0.3s ease forwards" }}>
    <div style={{ textAlign: "center", marginBottom: "2rem" }}>
      <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.4rem", color: "#fff", margin: "0 0 0.5rem" }}>
        Welcome to EasyJob
      </h2>
      <p style={{ color: "var(--mu)", fontSize: "0.85rem" }}>
        Tell us how you want to use EasyJob
      </p>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      {/* Seeker card */}
      <button onClick={() => {
        setUserRole("seeker");
        setPhase(PHASE.SETUP_INFO);
      }} style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: "2rem 1.25rem",
        cursor: "pointer", textAlign: "center",
        transition: "all 0.2s", fontFamily: "var(--fb)"
      }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = "var(--a)";
          e.currentTarget.style.background = "rgba(99,212,170,0.06)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>👤</div>
        <div style={{ color: "#fff", fontSize: "1rem", fontWeight: 700, fontFamily: "var(--fd)", marginBottom: "0.5rem" }}>
          I am looking for a job
        </div>
        <div style={{ color: "var(--mu)", fontSize: "0.78rem", lineHeight: 1.5 }}>
          Get matched to real jobs. Tailored resume. AI match score.
        </div>
      </button>

      {/* HR card */}
      <button onClick={() => {
        setUserRole("hr");
        setPhase(PHASE.HR_SETUP);
      }} style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: "2rem 1.25rem",
        cursor: "pointer", textAlign: "center",
        transition: "all 0.2s", fontFamily: "var(--fb)"
      }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = "#60a5fa";
          e.currentTarget.style.background = "rgba(96,165,250,0.06)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🏢</div>
        <div style={{ color: "#fff", fontSize: "1rem", fontWeight: 700, fontFamily: "var(--fd)", marginBottom: "0.5rem" }}>
          I am hiring
        </div>
        <div style={{ color: "var(--mu)", fontSize: "0.78rem", lineHeight: 1.5 }}>
          Review pre-scored candidates. Build your pipeline. Log outcomes.
        </div>
      </button>
    </div>
  </div>
)}
{/* HR SETUP — first time HR users */}
{phase === PHASE.HR_SETUP && (
  <Card>
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#60a5fa", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: "#0b1120" }}>1</div>
      <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: 0 }}>Set up your hiring profile</h2>
    </div>

    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.35rem" }}>Your Name *</label>
      <input
        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid var(--br)", borderRadius: 10, padding: "0.75rem", color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", outline: "none" }}
        placeholder="e.g. Rahul Sharma"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
      />
    </div>

    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.35rem" }}>Company / Organisation *</label>
      <input
        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid var(--br)", borderRadius: 10, padding: "0.75rem", color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", outline: "none" }}
        placeholder="e.g. Zepto, McKinsey, Independent Recruiter"
        value={draftCompany}
        onChange={(e) => setDraftCompany(e.target.value)}
      />
    </div>

    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.35rem" }}>Your Role</label>
      <select
        value={draftHrRole}
        onChange={(e) => setDraftHrRole(e.target.value)}
        style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--br)", borderRadius: 10, padding: "0.75rem", color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", outline: "none" }}>
        <option value="">Select your role</option>
        <option value="HR Manager">HR Manager</option>
        <option value="Talent Acquisition">Talent Acquisition</option>
        <option value="Recruiter">Recruiter</option>
        <option value="Founder">Founder</option>
        <option value="Hiring Manager">Hiring Manager</option>
        <option value="Independent Recruiter">Independent Recruiter</option>
      </select>
    </div>

    <div style={{ marginBottom: "1.25rem" }}>
      <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.5rem" }}>Roles you typically hire for</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
        {INTEREST_BUCKETS.map((b) => {
          const selected = draftBuckets.includes(b.id);
          return (
            <button key={b.id} onClick={() => setDraftBuckets(prev => selected ? prev.filter(x => x !== b.id) : [...prev, b.id])}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 0.8rem", borderRadius: 10, border: `1px solid ${selected ? "#60a5fa" : "rgba(255,255,255,0.08)"}`, background: selected ? "rgba(96,165,250,0.08)" : "rgba(255,255,255,0.02)", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: "0.9rem" }}>{b.icon}</span>
              <span style={{ fontSize: "0.78rem", color: selected ? "#60a5fa" : "rgba(255,255,255,0.7)", fontWeight: selected ? 600 : 400 }}>{b.label}</span>
              {selected && <span style={{ marginLeft: "auto", color: "#60a5fa", fontSize: "0.8rem" }}>✓</span>}
            </button>
          );
        })}
      </div>
    </div>

    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <Btn variant="ghost" onClick={() => setPhase(PHASE.ROLE_SELECT)}>← Back</Btn>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {loading && <Spinner />}
        <Btn onClick={saveHrProfile} disabled={loading || !draftName.trim() || !draftCompany.trim()}>
          {loading ? "Saving..." : "Go to HR Dashboard →"}
        </Btn>
      </div>
    </div>
  </Card>
)}

const P = {
  jdAnalysis: (jd) => ({
    sys: `You are a senior talent acquisition specialist. Extract the most critical skills from job descriptions.`,
    msg: `Analyze this job description and extract 7-9 most critical skills.

Job Description: ${jd}

Respond ONLY in valid JSON, no markdown:
{
  "jobTitle": "exact job title",
  "company": "company name or Unknown",
  "seniorityLevel": "Junior/Mid/Senior/Lead/Director",
  "skills": ["Skill 1", "Skill 2"],
  "roleType": "technical/business/creative/hybrid",
  "topPriority": "single most important skill"
}`,
  }),

  recommendation: (jd, m, skillSummary) => ({
    sys: `You are a candid career coach for India's job market.`,
    msg: `Evaluate candidate fit for ${m.jobTitle} at ${m.company}.

JD: ${jd.substring(0, 900)}
SKILLS: ${skillSummary}

## Verdict
Apply with Confidence | Apply Strategically | Consider Before Applying
2-sentence bottom-line.

## Match Score
X/100 — 1-sentence explanation.

## Strongest Assets
3 specific strengths for THIS role.

## Gaps to Address  
3 gaps — dealbreaker or coachable?

## Action Plan
2-3 specific steps.`,
  }),

  resumeTailor: (jd, m, background, skillSummary) => ({
    sys: `You are a FAANG-level resume strategist. ATS optimization, achievement-driven, honest.`,
    msg: `Create a fully tailored ATS-optimized resume.

TARGET: ${m.jobTitle} at ${m.company}
JD: ${jd.substring(0, 800)}
BACKGROUND: ${background}
SKILLS: ${skillSummary}

Open with 3-sentence Professional Summary. Use ## for sections. Tailor every bullet to JD language.`,
  }),

  atsReview: (jd, m, resume) => ({
    sys: `You play TWO roles: ATS SYSTEM (keyword scanner) and HIRING MANAGER (7-second scan).`,
    msg: `Review for ${m.jobTitle} at ${m.company}.
JD: ${jd.substring(0, 600)}
RESUME: ${resume.substring(0, 1000)}

## ATS Score: X/100
## Keywords Present and Missing
## Hiring Manager Impression
## Top 5 Fixes
## Shortlist Probability A/B/C/D`,
  }),

  coverLetter: (jd, m, resume, rec) => ({
    sys: `Write exceptional cover letters. Hook → Why You → Why Them → Close. Never "I am excited to apply."`,
    msg: `Cover letter for ${m.jobTitle} at ${m.company}.
JD: ${jd.substring(0, 700)}
RESUME: ${resume.substring(0, 800)}
~280 words. [Your Name] placeholder.`,
  }),
};

function Spinner() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", justifyContent: "center" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--a)", display: "block", animation: `pulse 1.1s ease ${i * 0.18}s infinite` }} />
      ))}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary", small }) {
  const base = { border: "none", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "var(--fb)", transition: "all 0.15s", opacity: disabled ? 0.45 : 1, padding: small ? "0.45rem 0.9rem" : "0.75rem 1.5rem", fontSize: small ? "0.78rem" : "0.85rem" };
  if (variant === "primary") return <button style={{ ...base, background: "linear-gradient(135deg,var(--a),#60a5fa)", color: "#0b1120" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "ghost") return <button style={{ ...base, background: "rgba(255,255,255,0.05)", border: "1px solid var(--br)", color: "rgba(255,255,255,0.5)" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "teal") return <button style={{ ...base, background: "linear-gradient(135deg,#0d9488,#0284c7)", color: "#fff" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "danger") return <button style={{ ...base, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Card({ children, style: sx }) {
  return <div style={{ background: "var(--card)", border: "1px solid var(--br)", borderRadius: 16, padding: "1.5rem", animation: "fadeUp 0.3s ease forwards", ...sx }}>{children}</div>;
}

function TA({ value, onChange, placeholder, rows = 8 }) {
  return <textarea style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid var(--br)", borderRadius: 10, padding: "0.85rem", color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", lineHeight: 1.65, resize: "vertical", outline: "none", minHeight: `${rows * 22}px` }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function MD({ text }) {
  if (!text) return null;
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^## (.+)$/gm, `<h2 style="color:#fff;font-size:0.95rem;margin:1rem 0 0.25rem;font-weight:600">$1</h2>`)
    .replace(/^### (.+)$/gm, `<h3 style="color:var(--a);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.07em;margin:0.8rem 0 0.2rem">$1</h3>`)
    .replace(/^\d+\. (.+)$/gm, `<div style="display:flex;gap:8px;margin:4px 0;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:6px;border-left:2px solid rgba(99,212,170,0.35)"><span>$1</span></div>`)
    .replace(/^- (.+)$/gm, `<div style="display:flex;gap:8px;margin:3px 0"><span style="color:var(--a)">▸</span><span>$1</span></div>`)
    .replace(/\n\n/g, "<br/><br/>").replace(/\n/g, "<br/>");
  return <div style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.7, fontSize: "0.86rem" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function PreBox({ text }) {
  return <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace", fontSize: "0.77rem", lineHeight: 1.75, color: "rgba(255,255,255,0.8)", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem", maxHeight: 380, overflowY: "auto", margin: 0 }}>{text}</pre>;
}

function SkillRow({ skill, rating, onChange, isTop }) {
  const lbl = ["", "Novice", "Learning", "Proficient", "Advanced", "Expert"];
  const clr = [, "#f87171", "#fb923c", "#fbbf24", "#4ade80", "var(--a)"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", padding: "0.7rem 1rem", borderRadius: 10, marginBottom: "0.4rem", background: rating ? "rgba(99,212,170,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${rating ? "rgba(99,212,170,0.2)" : "rgba(255,255,255,0.06)"}` }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 120 }}>
        {isTop && <span style={{ fontSize: "0.65rem", color: "#fbbf24" }}>★</span>}
        <span style={{ color: "rgba(255,255,255,0.88)", fontSize: "0.85rem" }}>{skill}</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", cursor: "pointer", background: rating >= n ? clr[n] : "rgba(255,255,255,0.07)", color: rating >= n ? "#0b1120" : "rgba(255,255,255,0.3)", fontWeight: 700, fontSize: "0.77rem" }}>{n}</button>
        ))}
        {rating > 0 && <span style={{ fontSize: "0.67rem", color: clr[rating], fontWeight: 600, minWidth: 55, marginLeft: 4 }}>{lbl[rating]}</span>}
      </div>
    </div>
  );
}

function ScoreBadge({ score }) {
  const col = score >= 75 ? "var(--a)" : score >= 55 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ width: 52, height: 52, borderRadius: "50%", border: `3px solid ${col}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "rgba(0,0,0,0.3)" }}>
      <span style={{ fontSize: "0.85rem", fontWeight: 800, color: col }}>{score}%</span>
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
        <circle cx="44" cy="44" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>{pct}</span>
        <span style={{ fontSize: "0.55rem", color: "var(--mu)" }}>/100</span>
      </div>
    </div>
  );
}

const FLOW_STEPS = [
  { key: "jd", label: "Job", icon: "01" },
  { key: "skills", label: "Skills", icon: "02" },
  { key: "rec", label: "Match", icon: "03" },
  { key: "resume", label: "Resume", icon: "04" },
  { key: "ats", label: "ATS", icon: "05" },
  { key: "cl", label: "Cover", icon: "06" },
];

function FlowStepper({ current }) {
  const idx = FLOW_STEPS.findIndex((s) => s.key === current);
  return (
    <div style={{ display: "flex", marginBottom: "1.5rem" }}>
      {FLOW_STEPS.map((s, i) => {
        const done = i < idx, active = i === idx;
        return (
          <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
              {i > 0 && <div style={{ flex: 1, height: 2, background: done ? "var(--a)" : "rgba(255,255,255,0.07)" }} />}
              <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: done ? "var(--a)" : active ? "rgba(99,212,170,0.12)" : "rgba(255,255,255,0.04)", border: `2px solid ${done ? "var(--a)" : active ? "var(--a)" : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 800, color: done ? "#0b1120" : active ? "var(--a)" : "rgba(255,255,255,0.25)" }}>{done ? "✓" : s.icon}</div>
              {i < FLOW_STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "var(--a)" : "rgba(255,255,255,0.07)" }} />}
            </div>
            <span style={{ fontSize: "0.5rem", marginTop: "0.25rem", textTransform: "uppercase", textAlign: "center", color: active ? "var(--a)" : done ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)", fontWeight: active ? 700 : 400 }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState(PHASE.LOADING);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState("seeker");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [draftBG, setDraftBG] = useState("");
  const [draftBuckets, setDraftBuckets] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jd, setJd] = useState("");
  const [meta, setMeta] = useState({ jobTitle: "", company: "", seniority: "", roleType: "", topPriority: "" });
  const [skills, setSkills] = useState([]);
  const [ratings, setRatings] = useState({});
  const [recommendation, setRec] = useState("");
  const [resume, setResume] = useState("");
  const [atsReview, setAtsReview] = useState("");
  const [atsScore, setAtsScore] = useState(null);
  const [coverLetter, setCL] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const bottomRef = useRef(null);

async function loadUserProfile(userId) {
  try {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    
    if (data) {
      setProfile(data);
      // Return to correct dashboard based on role
      if (data.user_role === "hr") {
        setUserRole("hr");
        setPhase(PHASE.HR);
        loadCandidates();
      } else {
        setUserRole("seeker");
        setPhase(PHASE.HOME);
      }
    } else {
      // First time user — show role selection
      setPhase(PHASE.ROLE_SELECT);
    }
  } catch { 
    setPhase(PHASE.ROLE_SELECT); 
  }
}

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [phase, loading]);

  useEffect(() => {
    const handleSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) { setUser(session.user); loadUserProfile(session.user.id); }
      else { setPhase(PHASE.AUTH); }
    };
    handleSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) { setUser(session.user); loadUserProfile(session.user.id); }
      else { setPhase(PHASE.AUTH); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (phase === PHASE.HOME && profile?.buckets?.length > 0) {
      loadJobsForProfile(profile);
    }
  }, [phase, profile]);

  async function loadJobsForProfile(p) {
    if (!p?.buckets?.length) return;
    setJobsLoading(true);
    const allJobs = [];
    for (const bucketId of p.buckets.slice(0, 3)) {
      const searchTerm = BUCKET_SEARCH_TERMS[bucketId] || bucketId;
      const fetched = await fetchJobs(searchTerm, "India");
      for (const job of fetched) {
        job.matchScore = computeMatchScore(p.background, job);
        job.bucketLabel = INTEREST_BUCKETS.find(b => b.id === bucketId)?.label || bucketId;
        allJobs.push(job);
      }
    }
    allJobs.sort((a, b) => b.matchScore - a.matchScore);
    setJobs(allJobs);
    setJobsLoading(false);
  }

  async function signInWithGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
    if (error) { setError(error.message); setLoading(false); }
  }

  async function saveProfile() {
    if (!draftBG.trim() || !user) return;
    setLoading(true); setError("");
    try {
      const { data, error } = await supabase
        .from("users")
        .upsert({ id: user.id, email: user.email, full_name: draftName.trim(), background: draftBG.trim(), buckets: draftBuckets }, { onConflict: "id" })
        .select().maybeSingle();
      if (error) { setError(error.message); }
      else { setProfile(data); setPhase(PHASE.HOME); }
    } catch (err) { setError("Failed to save. Please try again."); }
    setLoading(false);
  }
  async function saveHrProfile() {
  if (!draftName.trim() || !user) return;
  setLoading(true); setError("");
  try {
    const { data, error } = await supabase
      .from("users")
      .upsert({
        id: user.id,
        email: user.email,
        full_name: draftName.trim(),
        user_role: "hr",
        company_name: draftCompany.trim(),
        background: draftHrRole,
        buckets: draftBuckets
      }, { onConflict: "id" })
      .select().maybeSingle();

    if (error) { setError(error.message); }
    else {
      setProfile(data);
      setUserRole("hr");
      setPhase(PHASE.HR);
      loadCandidates();
    }
  } catch { setError("Failed to save. Please try again."); }
  setLoading(false);
}

  async function saveAssessment(matchScore) {
    if (!user) return;
    await supabase.from("skill_assessments").insert({ user_id: user.id, role_target: meta.jobTitle, skills: ratings, match_score: matchScore });
  }

  async function loadCandidates() {
    const { data } = await supabase.from("skill_assessments").select("*, users(full_name, email)").order("created_at", { ascending: false });
    setCandidates(data || []);
  }

  async function logOutcome(assessmentId, outcome) {
    await supabase.from("job_outcomes").insert({ user_id: selectedCandidate.user_id, job_title: selectedCandidate.role_target, match_score: selectedCandidate.match_score, outcome });
    setSelectedCandidate(null);
    loadCandidates();
  }

  function selectJobForAnalysis(job) {
    setSelectedJob(job);
    setJd(job.description);
    setMeta({ jobTitle: job.title, company: job.company, seniority: "", roleType: "", topPriority: "" });
    setPhase(PHASE.SKILLS);
    setSkills([]);
    setRatings({});
  }

  const skillSummary = skills.map((s) => `${s}: ${ratings[s] || "?"}/5`).join(", ");

  async function analyzeJD() {
    if (!jd.trim()) return;
    setLoading(true); setError("");
    try {
      const raw = await callClaude([{ role: "user", content: P.jdAnalysis(jd).msg }], P.jdAnalysis(jd).sys);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setSkills(parsed.skills || []);
      setMeta({ jobTitle: parsed.jobTitle || "", company: parsed.company || "", seniority: parsed.seniorityLevel || "", roleType: parsed.roleType || "", topPriority: parsed.topPriority || "" });
      setPhase(PHASE.SKILLS);
    } catch (e) { setError("Couldn't parse JD. Please try again."); }
    setLoading(false);
  }

  async function getRecommendation() {
    if (skills.some((s) => !ratings[s])) { setError("Please rate all skills."); return; }
    setLoading(true); setError("");
    const res = await callClaude([{ role: "user", content: P.recommendation(jd, meta, skillSummary).msg }], P.recommendation(jd, meta, skillSummary).sys);
    const scoreMatch = res.match(/(\d+)\/100/);
    if (scoreMatch) await saveAssessment(parseInt(scoreMatch[1]));
    setRec(res); setPhase(PHASE.REC); setLoading(false);
  }

  async function tailorResume() {
    setLoading(true); setError("");
    const res = await callClaude([{ role: "user", content: P.resumeTailor(jd, meta, profile.background, skillSummary).msg }], P.resumeTailor(jd, meta, profile.background, skillSummary).sys);
    setResume(res); setPhase(PHASE.RESUME); setLoading(false);
  }

  async function runATS() {
    setLoading(true); setError("");
    const res = await callClaude([{ role: "user", content: P.atsReview(jd, meta, resume).msg }], P.atsReview(jd, meta, resume).sys);
    const m = res.match(/ATS Score:\s*(\d+)\/100/i);
    if (m) setAtsScore(parseInt(m[1]));
    setAtsReview(res); setPhase(PHASE.ATS); setLoading(false);
  }

  async function generateCL() {
    setLoading(true); setError("");
    const res = await callClaude([{ role: "user", content: P.coverLetter(jd, meta, resume, recommendation).msg }], P.coverLetter(jd, meta, resume, recommendation).sys);
    setCL(res); setPhase(PHASE.CL); setLoading(false);
  }

  function startManualJD() {
    setJd(""); setMeta({ jobTitle: "", company: "", seniority: "", roleType: "", topPriority: "" });
    setSkills([]); setRatings({}); setRec(""); setResume("");
    setAtsReview(""); setAtsScore(null); setCL(""); setError("");
    setSelectedJob(null); setPhase(PHASE.JD);
  }

  function startEditProfile() {
    setDraftName(profile?.full_name || "");
    setDraftBG(profile?.background || "");
    setDraftBuckets(profile?.buckets || []);
    setPhase(PHASE.SETUP_INFO);
  }

  const inFlow = [PHASE.JD, PHASE.SKILLS, PHASE.REC, PHASE.RESUME, PHASE.ATS, PHASE.CL].includes(phase);

  return (
    <div style={{ "--a": "#63d4aa", "--card": "rgba(255,255,255,0.027)", "--br": "rgba(255,255,255,0.08)", "--mu": "rgba(255,255,255,0.38)", "--fd": "'Syne',sans-serif", "--fb": "'DM Sans',sans-serif", minHeight: "100vh", fontFamily: "var(--fb)", padding: "1.5rem 1rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,80%,100%{transform:translateY(0);opacity:0.6}40%{transform:translateY(-7px);opacity:1}} input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.22)}`}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* HEADER */}
        <header style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ fontFamily: "var(--fd)", fontSize: "clamp(1.6rem,5vw,2.2rem)", fontWeight: 800, color: "#fff", margin: "0 0 0.2rem" }}>
            Easy<span style={{ background: "linear-gradient(130deg,var(--a) 20%,#60a5fa 80%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Job</span>
          </h1>
          <p style={{ color: "var(--mu)", fontSize: "0.8rem", margin: 0 }}>AI-Powered Career Intelligence · India</p>
          {user && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
             {user && (
              <button onClick={() => supabase.auth.signOut()} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "5px 14px", color: "var(--mu)", fontSize: "0.75rem", cursor: "pointer" }}>Sign out</button>
                )}
              </div>
          )}
        </header>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#f87171", fontSize: "0.82rem" }}>⚠️ {error}</span>
            <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}>×</button>
          </div>
        )}

        {/* AUTH */}
        {phase === PHASE.AUTH && (
          <Card>
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>👋</div>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.3rem", color: "#fff", margin: "0 0 0.5rem" }}>Welcome to EasyJob</h2>
              <p style={{ color: "var(--mu)", fontSize: "0.84rem", margin: "0 0 1.5rem" }}>India's AI-powered career intelligence platform.</p>
              <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
                {loading && <Spinner />}
                <button onClick={signInWithGoogle} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: "0.75rem 1.5rem", cursor: "pointer", fontFamily: "var(--fb)", fontSize: "0.9rem", fontWeight: 600, color: "#333" }}>
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8.9 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.6 39.4 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.8l6.2 5.2C41 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                  {loading ? "Signing in..." : "Continue with Google"}
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* SETUP STEP 1 — Info */}
        {phase === PHASE.SETUP_INFO && (
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: "#0b1120" }}>1</div>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: 0 }}>Your profile</h2>
              <span style={{ color: "var(--mu)", fontSize: "0.75rem" }}>Step 1 of 2</span>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.35rem" }}>Your Name</label>
              <input style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid var(--br)", borderRadius: 10, padding: "0.75rem", color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", outline: "none" }} placeholder="e.g. Priya Sharma" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </div>
            <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.35rem" }}>Your Background & Resume *</label>
            <TA value={draftBG} onChange={setDraftBG} rows={11} placeholder={`Paste your resume or describe your background:\n\n• Work experience (company, role, dates, achievements)\n• Education & certifications\n• Technical skills & tools\n• Projects and notable wins`} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Btn onClick={() => { if (draftBG.trim()) setPhase(PHASE.SETUP_BUCKETS); }} disabled={!draftBG.trim()}>Next — Choose Interests →</Btn>
            </div>
          </Card>
        )}

        {/* SETUP STEP 2 — Buckets */}
        {phase === PHASE.SETUP_BUCKETS && (
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: "#0b1120" }}>2</div>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: 0 }}>What jobs do you want to see?</h2>
            </div>
            <p style={{ color: "var(--mu)", fontSize: "0.78rem", margin: "0 0 1.2rem" }}>Select all that apply. EasyJob will fetch real jobs from these areas for you.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1.2rem" }}>
              {INTEREST_BUCKETS.map((b) => {
                const selected = draftBuckets.includes(b.id);
                return (
                  <button key={b.id} onClick={() => setDraftBuckets(prev => selected ? prev.filter(x => x !== b.id) : [...prev, b.id])} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.7rem 0.9rem", borderRadius: 10, border: `1px solid ${selected ? "var(--a)" : "rgba(255,255,255,0.08)"}`, background: selected ? "rgba(99,212,170,0.08)" : "rgba(255,255,255,0.02)", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                    <span style={{ fontSize: "1rem" }}>{b.icon}</span>
                    <span style={{ fontSize: "0.8rem", color: selected ? "var(--a)" : "rgba(255,255,255,0.7)", fontWeight: selected ? 600 : 400 }}>{b.label}</span>
                    {selected && <span style={{ marginLeft: "auto", color: "var(--a)", fontSize: "0.8rem" }}>✓</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.SETUP_INFO)}>← Back</Btn>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={saveProfile} disabled={loading || draftBuckets.length === 0}>{loading ? "Saving..." : "Save & See My Jobs →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* HOME — Seeker */}
        {phase === PHASE.HOME && userRole === "seeker" && (
          <div style={{ animation: "fadeUp 0.3s ease forwards" }}>
            {/* Profile bar */}
            <div style={{ background: "rgba(99,212,170,0.05)", border: "1px solid rgba(99,212,170,0.2)", borderRadius: 12, padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(99,212,170,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--a)", fontWeight: 700 }}>
                  {(profile?.full_name || user?.email || "U")[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.85rem", fontWeight: 600 }}>{profile?.full_name || user?.email}</div>
                  <div style={{ color: "var(--mu)", fontSize: "0.72rem" }}>
                    {profile?.buckets?.map(b => INTEREST_BUCKETS.find(x => x.id === b)?.label).filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
              <button onClick={startEditProfile} style={{ background: "none", border: "1px solid var(--br)", borderRadius: 6, padding: "4px 10px", color: "var(--mu)", fontSize: "0.72rem", cursor: "pointer" }}>✏ Edit Profile</button>
            </div>

            {/* Matched jobs */}
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: 0 }}>Jobs matched for you</h2>
                {jobsLoading && <Spinner />}
                {!jobsLoading && jobs.length > 0 && <span style={{ color: "var(--mu)", fontSize: "0.75rem" }}>{jobs.length} jobs found</span>}
              </div>

              {!jobsLoading && jobs.length === 0 && (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--mu)", fontSize: "0.84rem", background: "var(--card)", border: "1px solid var(--br)", borderRadius: 12 }}>
                  No jobs loaded yet. Make sure your RapidAPI key is set on Render.
                </div>
              )}

              {jobs.slice(0, 10).map((job) => (
                <div key={job.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.9rem 1rem", border: "1px solid var(--br)", borderRadius: 12, marginBottom: "0.5rem", background: "var(--card)", transition: "all 0.15s" }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = "rgba(99,212,170,0.3)"}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}>
                  <ScoreBadge score={job.matchScore} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.15rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.title}</div>
                    <div style={{ color: "var(--mu)", fontSize: "0.75rem" }}>{job.company} · {job.location}</div>
                    <span style={{ display: "inline-block", marginTop: "0.25rem", fontSize: "0.65rem", padding: "2px 7px", borderRadius: 20, background: "rgba(99,212,170,0.08)", border: "1px solid rgba(99,212,170,0.2)", color: "var(--a)" }}>{job.bucketLabel}</span>
                  </div>
                  <Btn small onClick={() => selectJobForAnalysis(job)}>Analyse →</Btn>
                </div>
              ))}
            </div>

            {/* Manual JD option */}
            <div style={{ borderTop: "1px solid var(--br)", paddingTop: "1rem", textAlign: "center" }}>
              <p style={{ color: "var(--mu)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>Have a specific job in mind?</p>
              <Btn variant="ghost" onClick={startManualJD}>Paste a Job Description →</Btn>
            </div>
          </div>
        )}

        {/* FLOW HEADER */}
        {inFlow && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", padding: "0.55rem 0.85rem", background: "rgba(99,212,170,0.04)", border: "1px solid rgba(99,212,170,0.15)", borderRadius: 10 }}>
              <span style={{ color: "var(--a)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>
                {selectedJob ? `📋 ${selectedJob.title} · ${selectedJob.company}` : `✓ ${profile?.full_name || user?.email}`}
              </span>
              <button onClick={() => setPhase(PHASE.HOME)} style={{ background: "none", border: "1px solid var(--br)", borderRadius: 6, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer" }}>← Home</button>
            </div>
            <FlowStepper current={phase} />
          </>
        )}

        {/* JD — Manual paste */}
        {phase === PHASE.JD && (
          <Card>
            <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: "0 0 0.25rem" }}>Paste the Job Description</h2>
            <p style={{ color: "var(--mu)", fontSize: "0.75rem", margin: "0 0 0.9rem" }}>Include the full JD for the most accurate skill extraction.</p>
            <TA value={jd} onChange={setJd} rows={11} placeholder="Paste the full job description here..." />
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1rem", marginTop: "1rem" }}>
              {loading && <Spinner />}
              <Btn onClick={analyzeJD} disabled={loading || !jd.trim()}>{loading ? "Analyzing..." : "Extract Skills →"}</Btn>
            </div>
          </Card>
        )}

        {/* SKILLS */}
        {phase === PHASE.SKILLS && (
          <Card>
            <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: "0 0 0.2rem" }}>Rate Your Skills</h2>
            <p style={{ color: "var(--mu)", fontSize: "0.75rem", margin: "0 0 0.9rem" }}>
              {meta.jobTitle ? `${meta.jobTitle} at ${meta.company}` : selectedJob ? `${selectedJob.title} at ${selectedJob.company}` : "Be honest — this drives your match score."}
            </p>

            {skills.length === 0 && selectedJob && (
              <div style={{ padding: "1rem", background: "rgba(99,212,170,0.05)", border: "1px solid rgba(99,212,170,0.15)", borderRadius: 10, marginBottom: "1rem", textAlign: "center" }}>
                <p style={{ color: "var(--mu)", fontSize: "0.82rem", margin: "0 0 0.75rem" }}>Extracting skills from this job description...</p>
                {loading ? <Spinner /> : <Btn small onClick={async () => {
                  setLoading(true);
                  try {
                    const raw = await callClaude([{ role: "user", content: P.jdAnalysis(selectedJob.description).msg }], P.jdAnalysis(selectedJob.description).sys);
                    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
                    setSkills(parsed.skills || []);
                    setMeta({ jobTitle: parsed.jobTitle || selectedJob.title, company: parsed.company || selectedJob.company, seniority: parsed.seniorityLevel || "", roleType: parsed.roleType || "", topPriority: parsed.topPriority || "" });
                    setJd(selectedJob.description);
                  } catch { setError("Couldn't extract skills. Try pasting the full JD manually."); }
                  setLoading(false);
                }}>Extract Skills from JD →</Btn>}
              </div>
            )}

            {meta.topPriority && <div style={{ padding: "0.5rem 0.85rem", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, marginBottom: "0.9rem", fontSize: "0.75rem", color: "rgba(251,191,36,0.9)" }}>★ Top priority: {meta.topPriority}</div>}
            {skills.map((s) => <SkillRow key={s} skill={s} rating={ratings[s] || 0} onChange={(v) => setRatings((r) => ({ ...r, [s]: v }))} isTop={s === meta.topPriority} />)}
            {skills.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                <Btn variant="ghost" onClick={() => setPhase(PHASE.HOME)}>← Back</Btn>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {loading && <Spinner />}
                  <Btn onClick={getRecommendation} disabled={loading || skills.some((s) => !ratings[s])}>{loading ? "Scoring..." : "Get Match Score →"}</Btn>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* RECOMMENDATION */}
        {phase === PHASE.REC && (
          <Card>
            <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: "0 0 0.9rem" }}>Your Match Score & Recommendation</h2>
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}><MD text={recommendation} /></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.SKILLS)}>← Adjust</Btn>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={tailorResume} disabled={loading}>{loading ? "Generating..." : "Tailor My Resume →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* RESUME */}
        {phase === PHASE.RESUME && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.9rem" }}>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: 0 }}>Tailored Resume</h2>
              <button onClick={() => navigator.clipboard.writeText(resume)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--br)", borderRadius: 7, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer" }}>📋 Copy</button>
            </div>
            <PreBox text={resume} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.REC)}>← Back</Btn>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={runATS} disabled={loading}>{loading ? "Reviewing..." : "Run ATS Review →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* ATS */}
        {phase === PHASE.ATS && (
          <>
            {atsScore !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", background: "var(--card)", border: "1px solid var(--br)", borderRadius: 16, padding: "1.1rem 1.3rem", marginBottom: "0.9rem" }}>
                <ScoreDial score={atsScore} />
                <div>
                  <div style={{ fontFamily: "var(--fd)", fontSize: "1.05rem", fontWeight: 800, color: "#fff" }}>ATS Score: {atsScore >= 75 ? "🟢 Strong" : atsScore >= 55 ? "🟡 Borderline" : "🔴 High Risk"}</div>
                  <div style={{ color: "var(--mu)", fontSize: "0.76rem" }}>{atsScore >= 75 ? "Well-optimized for most ATS systems." : atsScore >= 55 ? "Improvements recommended." : "High risk of rejection."}</div>
                </div>
              </div>
            )}
            <Card>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: "0 0 0.9rem" }}>ATS & Hiring Manager Review</h2>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "1rem" }}><MD text={atsReview} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                <Btn variant="ghost" onClick={() => setPhase(PHASE.RESUME)}>← Resume</Btn>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {loading && <Spinner />}
                  <Btn variant="teal" onClick={generateCL} disabled={loading}>{loading ? "Writing..." : "✉ Generate Cover Letter →"}</Btn>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* COVER LETTER */}
        {phase === PHASE.CL && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.9rem" }}>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1rem", color: "#fff", margin: 0 }}>Cover Letter</h2>
              <button onClick={() => navigator.clipboard.writeText(coverLetter)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--br)", borderRadius: 7, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer" }}>📋 Copy</button>
            </div>
            <PreBox text={coverLetter} />
            <div style={{ marginTop: "0.9rem", padding: "0.7rem 0.9rem", background: "rgba(99,212,170,0.06)", border: "1px solid rgba(99,212,170,0.18)", borderRadius: 9 }}>
              <p style={{ color: "var(--a)", fontSize: "0.78rem", fontWeight: 600, margin: "0 0 0.15rem" }}>✓ Application package complete!</p>
              <p style={{ color: "var(--mu)", fontSize: "0.73rem", margin: 0 }}>Resume + Cover Letter tailored for {meta.jobTitle} at {meta.company}.</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.9rem" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.ATS)}>← ATS</Btn>
              <Btn onClick={() => setPhase(PHASE.HOME)}>🏠 Back to Home →</Btn>
            </div>
          </Card>
        )}

        {/* HR DASHBOARD */}
        {phase === PHASE.HR && (
          <div style={{ animation: "fadeUp 0.3s ease forwards" }}>
            {!selectedCandidate ? (
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <div>
                    <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: "0 0 0.2rem" }}>HR Dashboard</h2>
                    <p style={{ color: "var(--mu)", fontSize: "0.75rem", margin: 0 }}>Candidate Pipeline · {candidates.length} assessed</p>
                  </div>
                  <Btn small onClick={loadCandidates}>↻ Refresh</Btn>
                </div>
                <div style={{ padding: "0.6rem 0.9rem", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, marginBottom: "1rem", fontSize: "0.74rem", color: "rgba(251,191,36,0.9)" }}>
                  ★ Every outcome you log improves EasyJob's prediction accuracy.
                </div>
                {candidates.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--mu)", fontSize: "0.84rem" }}>No candidates yet. Assessments appear here as seekers complete skill ratings.</div>
                ) : (
                  candidates.map((c) => (
                    <div key={c.id} onClick={() => setSelectedCandidate(c)} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.8rem 0.9rem", border: "1px solid var(--br)", borderRadius: 12, marginBottom: "0.5rem", cursor: "pointer", background: "rgba(255,255,255,0.02)" }}
                      onMouseOver={(e) => e.currentTarget.style.background = "rgba(99,212,170,0.05)"}
                      onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(99,212,170,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--a)", fontWeight: 700, flexShrink: 0 }}>
                        {(c.users?.full_name || c.users?.email || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontSize: "0.86rem", fontWeight: 600 }}>{c.users?.full_name || c.users?.email || "Anonymous"}</div>
                        <div style={{ color: "var(--mu)", fontSize: "0.73rem" }}>{c.role_target} · {new Date(c.created_at).toLocaleDateString("en-IN")}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", fontWeight: 800, color: c.match_score >= 75 ? "var(--a)" : c.match_score >= 55 ? "#fbbf24" : "#f87171" }}>{c.match_score || "—"}</div>
                        <div style={{ fontSize: "0.62rem", color: "var(--mu)" }}>score</div>
                      </div>
                    </div>
                  ))
                )}
              </Card>
            ) : (
              <Card>
                <button onClick={() => setSelectedCandidate(null)} style={{ background: "none", border: "1px solid var(--br)", borderRadius: 6, padding: "4px 10px", color: "var(--mu)", fontSize: "0.72rem", cursor: "pointer", marginBottom: "1rem" }}>← Pipeline</button>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.1rem" }}>
                  <div style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(99,212,170,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--a)", fontWeight: 700, fontSize: "1rem" }}>
                    {(selectedCandidate.users?.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>{selectedCandidate.users?.full_name || selectedCandidate.users?.email}</div>
                    <div style={{ color: "var(--mu)", fontSize: "0.75rem" }}>Applied for {selectedCandidate.role_target}</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--fd)", fontSize: "1.4rem", fontWeight: 800, color: "var(--a)" }}>{selectedCandidate.match_score || "—"}</div>
                    <div style={{ fontSize: "0.62rem", color: "var(--mu)" }}>match score</div>
                  </div>
                </div>
                <div style={{ marginBottom: "1.1rem" }}>
                  <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.5rem" }}>Self-Assessed Skills</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {Object.entries(selectedCandidate.skills || {}).map(([skill, rating]) => (
                      <span key={skill} style={{ padding: "3px 10px", borderRadius: 20, fontSize: "0.73rem", background: "rgba(99,212,170,0.08)", border: "1px solid rgba(99,212,170,0.2)", color: "var(--a)" }}>{skill}: {rating}/5</span>
                    ))}
                  </div>
                </div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.5rem" }}>Log Outcome</div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {["interview", "shortlisted", "offer", "rejected", "ghosted"].map((o) => (
                    <button key={o} onClick={() => logOutcome(selectedCandidate.id, o)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--br)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", fontSize: "0.76rem", cursor: "pointer", fontWeight: 600, textTransform: "capitalize" }}>
                      {o === "interview" ? "📞 " : o === "offer" ? "🎉 " : o === "rejected" ? "❌ " : o === "shortlisted" ? "⭐ " : "👻 "}{o}
                    </button>
                  ))}
                </div>
                <p style={{ color: "var(--mu)", fontSize: "0.7rem", margin: "0.5rem 0 0" }}>Logging outcomes builds EasyJob's prediction accuracy.</p>
              </Card>
            )}
          </div>
        )}

        <div ref={bottomRef} />
        <p style={{ textAlign: "center", marginTop: "1.5rem", color: "rgba(255,255,255,0.1)", fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>EasyJob · Beta · Powered by Claude AI</p>
      </div>
    </div>
  );
}