import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const API_BASE = import.meta.env.VITE_API_URL || "";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function callClaude(messages, systemPrompt) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system: systemPrompt, max_tokens: 1000 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  const data = await res.json();
  return data.content?.map((b) => b.text || "").join("") || "";
}

const PHASE = {
  LOADING: "loading", AUTH: "auth", PROFILE: "profile",
  HOME: "home", JD: "jd", SKILLS: "skills",
  REC: "rec", RESUME: "resume", ATS: "ats", CL: "cl",
  HR: "hr"
};

const FLOW_STEPS = [
  { key: "jd", label: "Job Description", icon: "01" },
  { key: "skills", label: "Skill Assessment", icon: "02" },
  { key: "rec", label: "Recommendation", icon: "03" },
  { key: "resume", label: "Tailored Resume", icon: "04" },
  { key: "ats", label: "ATS Review", icon: "05" },
  { key: "cl", label: "Cover Letter", icon: "06" },
];

const P = {
  jdAnalysis: (jd) => ({
    sys: `You are a senior talent acquisition specialist. Decode job descriptions to identify what hiring managers ACTUALLY want.`,
    msg: `Analyze this job description and extract the 7-9 most critical skills.

Job Description:
${jd}

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
    sys: `You are a candid career coach. Give honest assessments.`,
    msg: `Evaluate candidate fit for ${m.jobTitle} at ${m.company}.

JD EXCERPT: ${jd.substring(0, 900)}
SELF-ASSESSED SKILLS: ${skillSummary}

## Verdict
Apply with Confidence | Apply Strategically | Consider Before Applying
2-sentence bottom-line.

## Match Score
X/100 — 1-sentence explanation.

## Strongest Assets
3 specific strengths for THIS role.

## Gaps to Address
3 gaps with: dealbreaker or coachable?

## Action Plan
2-3 specific steps.`,
  }),

  resumeTailor: (jd, m, background, skillSummary) => ({
    sys: `You are a FAANG-level resume strategist. ATS keyword optimization, achievement-driven language, honest framing.`,
    msg: `Create a fully tailored ATS-optimized resume.

TARGET: ${m.jobTitle} at ${m.company}
JD: ${jd.substring(0, 1000)}
CANDIDATE BACKGROUND: ${background}
SKILL LEVELS: ${skillSummary}

Open with 3-sentence Professional Summary. Tailor every bullet to echo JD language. Use ## for section headers.`,
  }),

  atsReview: (jd, m, resume) => ({
    sys: `You play TWO roles: ATS SYSTEM (mechanical keyword scanner) and HIRING MANAGER (skeptical, 7-second scan).`,
    msg: `Review this resume for ${m.jobTitle} at ${m.company}.

JD: ${jd.substring(0, 800)}
RESUME: ${resume}

## ATS Score: X/100
## Keyword Analysis - Present and Missing
## Hiring Manager First Impression
## Top 5 Critical Fixes
## Shortlist Probability A/B/C/D`,
  }),

  coverLetter: (jd, m, resume, rec) => ({
    sys: `You write exceptional cover letters. Hook → Why You → Why Them → Close. Never start with "I am excited to apply."`,
    msg: `Write a compelling cover letter for ${m.jobTitle} at ${m.company}.

JD: ${jd.substring(0, 900)}
RESUME: ${resume.substring(0, 1200)}
POSITIONING: ${rec.substring(0, 400)}

~300 words. Include [Your Name] placeholder.`,
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
  const base = { border: "none", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "var(--fb)", transition: "all 0.15s", opacity: disabled ? 0.45 : 1, padding: small ? "0.5rem 1rem" : "0.75rem 1.5rem", fontSize: small ? "0.78rem" : "0.85rem" };
  if (variant === "primary") return <button style={{ ...base, background: "linear-gradient(135deg,var(--a),#60a5fa)", color: "#0b1120" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "ghost") return <button style={{ ...base, background: "rgba(255,255,255,0.05)", border: "1px solid var(--br)", color: "rgba(255,255,255,0.5)" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "teal") return <button style={{ ...base, background: "linear-gradient(135deg,#0d9488,#0284c7)", color: "#fff" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "danger") return <button style={{ ...base, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }} onClick={onClick} disabled={disabled}>{children}</button>;
  if (variant === "purple") return <button style={{ ...base, background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff" }} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Card({ children, style: sx }) {
  return <div style={{ background: "var(--card)", border: "1px solid var(--br)", borderRadius: 16, padding: "1.6rem", animation: "fadeUp 0.35s ease forwards", ...sx }}>{children}</div>;
}

function TA({ value, onChange, placeholder, rows = 8 }) {
  return <textarea style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid var(--br)", borderRadius: 10, padding: "0.85rem", color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", lineHeight: 1.65, resize: "vertical", outline: "none", minHeight: `${rows * 22}px` }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function MD({ text }) {
  if (!text) return null;
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^## (.+)$/gm, `<h2 style="color:#fff;font-size:0.98rem;margin:1.1rem 0 0.3rem">$1</h2>`)
    .replace(/^### (.+)$/gm, `<h3 style="color:var(--a);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.07em;margin:0.9rem 0 0.2rem">$1</h3>`)
    .replace(/^\d+\. (.+)$/gm, `<div style="display:flex;gap:8px;margin:4px 0;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:6px;border-left:2px solid rgba(99,212,170,0.35)"><span>$1</span></div>`)
    .replace(/^- (.+)$/gm, `<div style="display:flex;gap:8px;margin:3px 0"><span style="color:var(--a)">▸</span><span>$1</span></div>`)
    .replace(/\n\n/g, "<br/><br/>").replace(/\n/g, "<br/>");
  return <div style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.72, fontSize: "0.87rem" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function PreBox({ text }) {
  return <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace", fontSize: "0.77rem", lineHeight: 1.75, color: "rgba(255,255,255,0.8)", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem", maxHeight: 380, overflowY: "auto", margin: 0 }}>{text}</pre>;
}

function SkillRow({ skill, rating, onChange, isTop }) {
  const lbl = ["", "Novice", "Learning", "Proficient", "Advanced", "Expert"];
  const clr = [, "#f87171", "#fb923c", "#fbbf24", "#4ade80", "var(--a)"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", padding: "0.75rem 1rem", borderRadius: 10, marginBottom: "0.45rem", background: rating ? "rgba(99,212,170,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${rating ? "rgba(99,212,170,0.2)" : "rgba(255,255,255,0.06)"}` }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 120 }}>
        {isTop && <span style={{ fontSize: "0.65rem", color: "#fbbf24" }}>★</span>}
        <span style={{ color: "rgba(255,255,255,0.88)", fontSize: "0.86rem" }}>{skill}</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", cursor: "pointer", background: rating >= n ? clr[n] : "rgba(255,255,255,0.07)", color: rating >= n ? "#0b1120" : "rgba(255,255,255,0.3)", fontWeight: 700, fontSize: "0.77rem" }}>{n}</button>
        ))}
        {rating > 0 && <span style={{ fontSize: "0.67rem", color: clr[rating], fontWeight: 600, minWidth: 60, marginLeft: 4 }}>{lbl[rating]}</span>}
      </div>
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
        <span style={{ fontFamily: "var(--fd)", fontSize: "1.35rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>{pct}</span>
        <span style={{ fontSize: "0.55rem", color: "var(--mu)" }}>/100</span>
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
              {i > 0 && <div style={{ flex: 1, height: 2, background: done ? "var(--a)" : "rgba(255,255,255,0.07)" }} />}
              <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: done ? "var(--a)" : active ? "rgba(99,212,170,0.12)" : "rgba(255,255,255,0.04)", border: `2px solid ${done ? "var(--a)" : active ? "var(--a)" : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 800, color: done ? "#0b1120" : active ? "var(--a)" : "rgba(255,255,255,0.25)" }}>{done ? "✓" : s.icon}</div>
              {i < FLOW_STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "var(--a)" : "rgba(255,255,255,0.07)" }} />}
            </div>
            <span style={{ fontSize: "0.52rem", marginTop: "0.3rem", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center", color: active ? "var(--a)" : done ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)", fontWeight: active ? 700 : 400 }}>{s.label}</span>
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
  const [magicSent, setMagicSent] = useState(false);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [draftBG, setDraftBG] = useState("");
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [phase, loading]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadUserProfile(session.user.id);
      } else {
        setPhase(PHASE.AUTH);
      }
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setPhase(PHASE.AUTH);
      }
    });
  }, []);

  async function loadUserProfile(userId) {
    const { data } = await supabase.from("users").select("*").eq("id", userId).single();
    if (data) {
      setProfile(data);
      setPhase(PHASE.HOME);
    } else {
      setPhase(PHASE.PROFILE);
    }
  }

  async function sendMagicLink() {
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) { setError(error.message); } else { setMagicSent(true); }
    setLoading(false);
  }

  async function saveProfile() {
    if (!draftBG.trim() || !user) return;
    setLoading(true);
    const profileData = { id: user.id, email: user.email, full_name: draftName.trim(), background: draftBG.trim() };
    const { data, error } = await supabase.from("users").upsert(profileData).select().single();
    if (!error && data) { setProfile(data); setPhase(PHASE.HOME); }
    else { setError("Failed to save profile. Please try again."); }
    setLoading(false);
  }

  async function saveAssessment(matchScore) {
    if (!user) return;
    await supabase.from("skill_assessments").insert({
      user_id: user.id,
      role_target: meta.jobTitle,
      skills: ratings,
      match_score: matchScore
    });
  }

  async function loadCandidates() {
    const { data } = await supabase
      .from("skill_assessments")
      .select("*, users(full_name, email)")
      .order("created_at", { ascending: false });
    setCandidates(data || []);
  }

  async function logOutcome(assessmentId, outcome) {
    await supabase.from("job_outcomes").insert({
      user_id: selectedCandidate.user_id,
      job_title: selectedCandidate.role_target,
      match_score: selectedCandidate.match_score,
      outcome
    });
    setSelectedCandidate(null);
    loadCandidates();
  }

  const skillSummary = skills.map((s) => `${s}: ${ratings[s] || "?"}/5`).join(", ");

  async function apiCall(promptFn, ...args) {
    const { sys, msg } = promptFn(...args);
    return await callClaude([{ role: "user", content: msg }], sys);
  }

  function startNewJob() {
    setJd(""); setMeta({ jobTitle: "", company: "", seniority: "", roleType: "", topPriority: "" });
    setSkills([]); setRatings({}); setRec(""); setResume("");
    setAtsReview(""); setAtsScore(null); setCL(""); setError("");
    setPhase(PHASE.JD);
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
    const scoreMatch = res.match(/(\d+)\/100/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
    if (score) await saveAssessment(score);
    setRec(res); setPhase(PHASE.REC); setLoading(false);
  }

  async function tailorResume() {
    setLoading(true); setError("");
    const res = await apiCall(P.resumeTailor, jd, meta, profile.background, skillSummary);
    setResume(res); setPhase(PHASE.RESUME); setLoading(false);
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
    setCL(res); setPhase(PHASE.CL); setLoading(false);
  }

  const inFlow = [PHASE.JD, PHASE.SKILLS, PHASE.REC, PHASE.RESUME, PHASE.ATS, PHASE.CL].includes(phase);

  return (
    <div style={{ "--a": "#63d4aa", "--card": "rgba(255,255,255,0.027)", "--br": "rgba(255,255,255,0.08)", "--mu": "rgba(255,255,255,0.38)", "--fd": "'Syne',sans-serif", "--fb": "'DM Sans',sans-serif", minHeight: "100vh", fontFamily: "var(--fb)", padding: "2rem 1rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,80%,100%{transform:translateY(0);opacity:0.6}40%{transform:translateY(-7px);opacity:1}} input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.22)}`}</style>

      <div style={{ maxWidth: 740, margin: "0 auto" }}>

        {/* HEADER */}
        <header style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontFamily: "var(--fd)", fontSize: "clamp(1.8rem,5vw,2.4rem)", fontWeight: 800, color: "#fff", margin: "0 0 0.3rem" }}>
            Easy<span style={{ background: "linear-gradient(130deg,var(--a) 20%,#60a5fa 80%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Job</span>
          </h1>
          <p style={{ color: "var(--mu)", fontSize: "0.82rem", margin: 0 }}>AI-Powered Career Intelligence · India</p>
          {user && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
              <button onClick={() => { setUserRole("seeker"); setPhase(PHASE.HOME); }} style={{ background: userRole === "seeker" ? "rgba(99,212,170,0.15)" : "transparent", border: "1px solid rgba(99,212,170,0.3)", borderRadius: 20, padding: "4px 14px", color: userRole === "seeker" ? "var(--a)" : "var(--mu)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>Seeker</button>
              <button onClick={() => { setUserRole("hr"); setPhase(PHASE.HR); loadCandidates(); }} style={{ background: userRole === "hr" ? "rgba(99,212,170,0.15)" : "transparent", border: "1px solid rgba(99,212,170,0.3)", borderRadius: 20, padding: "4px 14px", color: userRole === "hr" ? "var(--a)" : "var(--mu)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>HR Dashboard</button>
              <button onClick={() => supabase.auth.signOut()} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "4px 14px", color: "var(--mu)", fontSize: "0.75rem", cursor: "pointer" }}>Sign out</button>
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
              <p style={{ color: "var(--mu)", fontSize: "0.84rem", margin: "0 0 1.5rem" }}>Enter your email to get started. We'll send you a magic link — no password needed.</p>
              {!magicSent ? (
                <>
                  <input style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid var(--br)", borderRadius: 10, padding: "0.75rem", color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", outline: "none", marginBottom: "1rem", textAlign: "center" }}
                    placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMagicLink()} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
                    {loading && <Spinner />}
                    <Btn onClick={sendMagicLink} disabled={loading || !email.trim()}>{loading ? "Sending..." : "Send Magic Link →"}</Btn>
                  </div>
                </>
              ) : (
                <div style={{ padding: "1rem", background: "rgba(99,212,170,0.08)", border: "1px solid rgba(99,212,170,0.2)", borderRadius: 12 }}>
                  <p style={{ color: "var(--a)", fontWeight: 600, margin: "0 0 0.3rem" }}>✓ Check your email!</p>
                  <p style={{ color: "var(--mu)", fontSize: "0.82rem", margin: 0 }}>We sent a magic link to <strong style={{ color: "rgba(255,255,255,0.7)" }}>{email}</strong>. Click it to sign in.</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* PROFILE SETUP */}
        {phase === PHASE.PROFILE && (
          <Card>
            <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: "0 0 0.3rem" }}>Set up your profile</h2>
            <p style={{ color: "var(--mu)", fontSize: "0.78rem", margin: "0 0 1.2rem" }}>You only do this once. Your background is saved and reused for every job application.</p>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.4rem" }}>Your Name</label>
              <input style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid var(--br)", borderRadius: 10, padding: "0.75rem", color: "#fff", fontSize: "0.87rem", fontFamily: "var(--fb)", outline: "none" }} placeholder="e.g. Priya Sharma" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </div>
            <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.4rem" }}>Your Background & Resume *</label>
            <TA value={draftBG} onChange={setDraftBG} rows={12} placeholder={`Paste your resume or describe your background:\n\n• Work experience (company, role, dates, achievements)\n• Education & certifications\n• Technical skills & tools\n• Projects and notable wins`} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem", gap: "1rem", alignItems: "center" }}>
              {loading && <Spinner />}
              <Btn onClick={saveProfile} disabled={loading || !draftBG.trim()}>{loading ? "Saving..." : "Save Profile & Start →"}</Btn>
            </div>
          </Card>
        )}

        {/* SEEKER HOME */}
        {phase === PHASE.HOME && userRole === "seeker" && (
          <div style={{ animation: "fadeUp 0.35s ease forwards" }}>
            <div style={{ background: "rgba(99,212,170,0.05)", border: "1px solid rgba(99,212,170,0.2)", borderRadius: 12, padding: "0.85rem 1.1rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ color: "var(--a)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase" }}>✓ Profile Active</span>
                {profile?.full_name && <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.8rem", marginLeft: "0.5rem" }}>· {profile.full_name}</span>}
              </div>
              <button onClick={() => { setDraftName(profile?.full_name || ""); setDraftBG(profile?.background || ""); setPhase(PHASE.PROFILE); }} style={{ background: "none", border: "1px solid var(--br)", borderRadius: 6, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer" }}>✏ Edit</button>
            </div>
            <Card>
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎯</div>
                <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.3rem", color: "#fff", margin: "0 0 0.5rem" }}>
                  Okay {profile?.full_name ? profile.full_name.split(" ")[0] : "there"}, which job are you eyeing?
                </h2>
                <p style={{ color: "var(--mu)", fontSize: "0.85rem", margin: "0 0 1.75rem" }}>Paste a job description — I'll assess your fit, tailor your resume, and write your cover letter.</p>
                <Btn onClick={startNewJob}>Paste a Job Description →</Btn>
              </div>
            </Card>
          </div>
        )}

        {/* FLOW HEADER */}
        {inFlow && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", padding: "0.6rem 0.9rem", background: "rgba(99,212,170,0.04)", border: "1px solid rgba(99,212,170,0.15)", borderRadius: 10 }}>
              <span style={{ color: "var(--a)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>✓ {profile?.full_name || user?.email}</span>
              <button onClick={() => setPhase(PHASE.HOME)} style={{ background: "none", border: "1px solid var(--br)", borderRadius: 6, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer" }}>← Home</button>
            </div>
            <FlowStepper current={phase} />
          </>
        )}

        {/* JD */}
        {phase === PHASE.JD && (
          <Card>
            <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: "0 0 0.3rem" }}>Paste the Job Description</h2>
            <p style={{ color: "var(--mu)", fontSize: "0.78rem", margin: "0 0 1rem" }}>Include the full JD for the most accurate skill extraction.</p>
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
            <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: "0 0 0.2rem" }}>Rate Your Skills</h2>
            <p style={{ color: "var(--mu)", fontSize: "0.78rem", margin: "0 0 1rem" }}>{meta.jobTitle} at {meta.company} — be honest, this drives your match score.</p>
            {meta.topPriority && <div style={{ padding: "0.55rem 0.85rem", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, marginBottom: "1rem", fontSize: "0.76rem", color: "rgba(251,191,36,0.9)" }}>★ Top priority: {meta.topPriority}</div>}
            {skills.map((s) => <SkillRow key={s} skill={s} rating={ratings[s] || 0} onChange={(v) => setRatings((r) => ({ ...r, [s]: v }))} isTop={s === meta.topPriority} />)}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.JD)}>← Back</Btn>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={getRecommendation} disabled={loading || skills.some((s) => !ratings[s])}>{loading ? "Assessing..." : "Get Match Score →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* RECOMMENDATION */}
        {phase === PHASE.REC && (
          <Card>
            <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: "0 0 1rem" }}>Your Match Score & Recommendation</h2>
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "1.1rem", marginBottom: "1rem" }}><MD text={recommendation} /></div>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: 0 }}>Tailored Resume</h2>
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
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", background: "var(--card)", border: "1px solid var(--br)", borderRadius: 16, padding: "1.2rem 1.4rem", marginBottom: "1rem" }}>
                <ScoreDial score={atsScore} />
                <div>
                  <div style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>ATS Score: {atsScore >= 75 ? "🟢 Strong" : atsScore >= 55 ? "🟡 Borderline" : "🔴 High Risk"}</div>
                  <div style={{ color: "var(--mu)", fontSize: "0.78rem" }}>{atsScore >= 75 ? "Well-optimized for most ATS systems." : atsScore >= 55 ? "Will pass some systems. Improvements recommended." : "High risk of automated rejection."}</div>
                </div>
              </div>
            )}
            <Card>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: "0 0 1rem" }}>ATS & Hiring Manager Review</h2>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "1.1rem" }}><MD text={atsReview} /></div>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", color: "#fff", margin: 0 }}>Cover Letter</h2>
              <button onClick={() => navigator.clipboard.writeText(coverLetter)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--br)", borderRadius: 7, padding: "3px 9px", color: "var(--mu)", fontSize: "0.7rem", cursor: "pointer" }}>📋 Copy</button>
            </div>
            <PreBox text={coverLetter} />
            <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "rgba(99,212,170,0.06)", border: "1px solid rgba(99,212,170,0.18)", borderRadius: 9 }}>
              <p style={{ color: "var(--a)", fontSize: "0.78rem", fontWeight: 600, margin: "0 0 0.2rem" }}>✓ Application package complete!</p>
              <p style={{ color: "var(--mu)", fontSize: "0.75rem", margin: 0 }}>Resume + Cover Letter tailored for <strong style={{ color: "rgba(255,255,255,0.7)" }}>{meta.jobTitle}</strong> at <strong style={{ color: "rgba(255,255,255,0.7)" }}>{meta.company}</strong>.</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <Btn variant="ghost" onClick={() => setPhase(PHASE.ATS)}>← ATS Review</Btn>
              <Btn onClick={() => setPhase(PHASE.HOME)}>🏠 Back to Home →</Btn>
            </div>
          </Card>
        )}

        {/* HR DASHBOARD */}
        {phase === PHASE.HR && (
          <div style={{ animation: "fadeUp 0.35s ease forwards" }}>
            {!selectedCandidate ? (
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
                  <div>
                    <h2 style={{ fontFamily: "var(--fd)", fontSize: "1.2rem", color: "#fff", margin: "0 0 0.2rem" }}>HR Dashboard</h2>
                    <p style={{ color: "var(--mu)", fontSize: "0.78rem", margin: 0 }}>Candidate Pipeline · {candidates.length} assessed</p>
                  </div>
                  <Btn small onClick={loadCandidates}>↻ Refresh</Btn>
                </div>

                <div style={{ padding: "0.7rem 1rem", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 9, marginBottom: "1.2rem", fontSize: "0.76rem", color: "rgba(251,191,36,0.9)" }}>
                  ★ Every outcome you log improves EasyJob's prediction accuracy — this is the data flywheel.
                </div>

                {candidates.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--mu)", fontSize: "0.84rem" }}>
                    No candidates yet. Assessments will appear here as seekers complete their skill ratings.
                  </div>
                ) : (
                  candidates.map((c) => (
                    <div key={c.id} onClick={() => setSelectedCandidate(c)} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.85rem 1rem", border: "1px solid var(--br)", borderRadius: 12, marginBottom: "0.6rem", cursor: "pointer", background: "rgba(255,255,255,0.02)", transition: "all 0.15s" }}
                      onMouseOver={(e) => e.currentTarget.style.background = "rgba(99,212,170,0.05)"}
                      onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(99,212,170,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--a)", fontWeight: 700, fontSize: "0.9rem", flexShrink: 0 }}>
                        {(c.users?.full_name || c.users?.email || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontSize: "0.88rem", fontWeight: 600 }}>{c.users?.full_name || c.users?.email || "Anonymous"}</div>
                        <div style={{ color: "var(--mu)", fontSize: "0.75rem" }}>{c.role_target} · {new Date(c.created_at).toLocaleDateString("en-IN")}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--fd)", fontSize: "1.1rem", fontWeight: 800, color: c.match_score >= 75 ? "var(--a)" : c.match_score >= 55 ? "#fbbf24" : "#f87171" }}>{c.match_score || "—"}</div>
                        <div style={{ fontSize: "0.65rem", color: "var(--mu)" }}>match score</div>
                      </div>
                    </div>
                  ))
                )}
              </Card>
            ) : (
              <Card>
                <button onClick={() => setSelectedCandidate(null)} style={{ background: "none", border: "1px solid var(--br)", borderRadius: 6, padding: "4px 10px", color: "var(--mu)", fontSize: "0.75rem", cursor: "pointer", marginBottom: "1rem" }}>← Pipeline</button>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.2rem" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(99,212,170,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--a)", fontWeight: 700, fontSize: "1.1rem" }}>
                    {(selectedCandidate.users?.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ color: "#fff", fontSize: "1rem", fontWeight: 600 }}>{selectedCandidate.users?.full_name || selectedCandidate.users?.email}</div>
                    <div style={{ color: "var(--mu)", fontSize: "0.78rem" }}>Applied for {selectedCandidate.role_target}</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--fd)", fontSize: "1.4rem", fontWeight: 800, color: "var(--a)" }}>{selectedCandidate.match_score || "—"}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--mu)" }}>match score</div>
                  </div>
                </div>

                <div style={{ marginBottom: "1.2rem" }}>
                  <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.6rem" }}>Self-Assessed Skills</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {Object.entries(selectedCandidate.skills || {}).map(([skill, rating]) => (
                      <span key={skill} style={{ padding: "3px 10px", borderRadius: 20, fontSize: "0.75rem", background: "rgba(99,212,170,0.08)", border: "1px solid rgba(99,212,170,0.2)", color: "var(--a)" }}>
                        {skill}: {rating}/5
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: "1.2rem" }}>
                  <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.6rem" }}>Log Interview Outcome</div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {["interview", "shortlisted", "offer", "rejected", "ghosted"].map((o) => (
                      <button key={o} onClick={() => logOutcome(selectedCandidate.id, o)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--br)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", fontSize: "0.78rem", cursor: "pointer", fontFamily: "var(--fb)", fontWeight: 600, textTransform: "capitalize" }}>
                        {o === "interview" ? "📞 " : o === "offer" ? "🎉 " : o === "rejected" ? "❌ " : o === "shortlisted" ? "⭐ " : "👻 "}{o}
                      </button>
                    ))}
                  </div>
                  <p style={{ color: "var(--mu)", fontSize: "0.72rem", margin: "0.5rem 0 0" }}>Logging outcomes builds EasyJob's prediction accuracy — your flywheel data.</p>
                </div>
              </Card>
            )}
          </div>
        )}

        <div ref={bottomRef} />
        <p style={{ textAlign: "center", marginTop: "2rem", color: "rgba(255,255,255,0.1)", fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>EasyJob · Beta · Powered by Claude AI</p>
      </div>
    </div>
  );
}
