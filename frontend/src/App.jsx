import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const API_BASE = import.meta.env.VITE_API_URL || "";
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "",
  import.meta.env.VITE_SUPABASE_KEY || ""
);

/* ── tokens ── */
const T = {
  bg:      "#FAF7F2",
  card:    "#FFFFFF",
  teal:    "#2C4A3E",
  tealMid: "#3D6B5A",
  tealLt:  "#E6F0EC",
  terra:   "#C5603A",
  terraDk: "#A0391A",
  terraLt: "#FDF0EA",
  border:  "#E8E0D5",
  text:    "#1A1A1A",
  muted:   "#8B7E75",
};

/* ── api ── */
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
  for (const word of uniqueWords) { if (resumeLower.includes(word)) matches++; }
  const score = Math.round((matches / Math.max(uniqueWords.length, 1)) * 100);
  return Math.min(95, Math.max(30, score));
}

const INTEREST_BUCKETS = [
  { id: "product",       label: "Product Management",        icon: "🎯" },
  { id: "consulting",    label: "Consulting & Strategy",     icon: "👔" },
  { id: "chief-of-staff",label: "Chief of Staff",            icon: "👑" },
  { id: "fullstack",     label: "Full Stack Developer",      icon: "💻" },
  { id: "data-analyst",  label: "Business & Data Analyst",   icon: "📊" },
  { id: "marketing",     label: "Marketing & Growth",        icon: "📈" },
  { id: "finance",       label: "Finance & Banking",         icon: "🏦" },
  { id: "operations",    label: "Operations & Program Mgmt", icon: "⚙️" },
  { id: "social-sector", label: "Social Sector / NGO",       icon: "🌱" },
  { id: "hr",            label: "Human Resources",           icon: "🤝" },
];

const BUCKET_SEARCH_TERMS = {
  "product": "Product Manager", "consulting": "Strategy Consultant",
  "chief-of-staff": "Chief of Staff", "fullstack": "Full Stack Developer",
  "data-analyst": "Business Analyst", "marketing": "Marketing Manager",
  "finance": "Finance Analyst", "operations": "Operations Manager",
  "social-sector": "Program Manager NGO", "hr": "HR Manager",
};

const PHASE = {
  LOADING:"loading", AUTH:"auth", ROLE_SELECT:"role_select",
  SETUP_INFO:"setup_info", SETUP_BUCKETS:"setup_buckets",
  HR_SETUP:"hr_setup", HOME:"home",
  JD:"jd", SKILLS:"skills", REC:"rec", RESUME:"resume", ATS:"ats", CL:"cl", HR:"hr"
};

const P = {
  jdAnalysis: (jd) => ({
    sys: `You are a senior talent acquisition specialist. Extract the most critical skills from job descriptions.`,
    msg: `Analyze this job description and extract 7-9 most critical skills.\n\nJob Description: ${jd}\n\nRespond ONLY in valid JSON, no markdown:\n{\n  "jobTitle": "exact job title",\n  "company": "company name or Unknown",\n  "seniorityLevel": "Junior/Mid/Senior/Lead/Director",\n  "skills": ["Skill 1", "Skill 2"],\n  "roleType": "technical/business/creative/hybrid",\n  "topPriority": "single most important skill"\n}`,
  }),
  recommendation: (jd, m, skillSummary) => ({
    sys: `You are a candid career coach for the global job market. Use positive, encouraging language throughout. Rephrase any negative observations as growth opportunities.`,
    msg: `Evaluate candidate fit for ${m.jobTitle} at ${m.company}.\n\nJD: ${jd.substring(0, 900)}\nSKILLS: ${skillSummary}\n\n## Verdict\nApply with Confidence | Apply Strategically | Build These Skills First\n2-sentence bottom-line.\n\n## Match Score\nX/100 — 1-sentence explanation.\n\n## Strongest Assets\n3 specific strengths for THIS role.\n\n## Skills to Strengthen\n3 growth areas — frame each as an opportunity to develop.\n\n## Action Plan\n2-3 specific steps to move forward.`,
  }),
  resumeTailor: (jd, m, background, skillSummary) => ({
    sys: `You are a FAANG-level resume strategist. ATS optimization, achievement-driven, honest.`,
    msg: `Create a fully tailored ATS-optimized resume.\n\nTARGET: ${m.jobTitle} at ${m.company}\nJD: ${jd.substring(0, 800)}\nBACKGROUND: ${background}\nSKILLS: ${skillSummary}\n\nOpen with 3-sentence Professional Summary. Use ## for sections. Tailor every bullet to JD language.`,
  }),
  atsReview: (jd, m, resume) => ({
    sys: `You play TWO roles: ATS SYSTEM (keyword scanner) and HIRING MANAGER (7-second scan). Use positive framing throughout — present every finding as an opportunity to strengthen the application.`,
    msg: `Review for ${m.jobTitle} at ${m.company}.\nJD: ${jd.substring(0, 600)}\nRESUME: ${resume.substring(0, 1000)}\n\n## ATS Score: X/100\n## Keywords to Add\n## Hiring Manager Impression\n## Top 5 Ways to Strengthen\n## Shortlist Probability A/B/C/D`,
  }),
  coverLetter: (jd, m, resume, rec) => ({
    sys: `Write exceptional cover letters. Hook → Why You → Why Them → Close. Use active, confident language throughout. Never use "I am excited to apply."`,
    msg: `Cover letter for ${m.jobTitle} at ${m.company}.\nJD: ${jd.substring(0, 700)}\nRESUME: ${resume.substring(0, 800)}\n~280 words. [Your Name] placeholder.`,
  }),
};

/* ── primitives ── */
function Spinner() {
  return (
    <div style={{ display:"flex", gap:5, alignItems:"center", justifyContent:"center" }}>
      {[0,1,2].map(i => (
        <span key={i} style={{ width:7, height:7, borderRadius:"50%", background:T.teal, display:"block", animation:`pulse 1.1s ease ${i*0.18}s infinite` }} />
      ))}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant="primary", small }) {
  const base = {
    border:"none", borderRadius:8, cursor:disabled?"not-allowed":"pointer",
    fontWeight:600, fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s",
    opacity:disabled?0.5:1, padding:small?"0.45rem 1rem":"0.75rem 1.5rem",
    fontSize:small?"0.78rem":"0.87rem",
  };
  if (variant === "primary") return (
    <button style={{ ...base, background:T.teal, color:"#fff" }} onClick={onClick} disabled={disabled}>{children}</button>
  );
  if (variant === "terra") return (
    <button style={{ ...base, background:T.terra, color:"#fff" }} onClick={onClick} disabled={disabled}>{children}</button>
  );
  if (variant === "secondary") return (
    <button style={{ ...base, background:T.tealLt, color:T.teal, border:`1px solid ${T.border}` }} onClick={onClick} disabled={disabled}>{children}</button>
  );
  if (variant === "danger") return (
    <button style={{ ...base, background:T.terraLt, color:T.terraDk, border:`1px solid ${T.terra}` }} onClick={onClick} disabled={disabled}>{children}</button>
  );
}

function Card({ children, style: sx }) {
  return (
    <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:"1.5rem", animation:"fadeUp 0.3s ease forwards", ...sx }}>
      {children}
    </div>
  );
}

function TA({ value, onChange, placeholder, rows=8 }) {
  return (
    <textarea style={{ width:"100%", boxSizing:"border-box", background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"0.85rem", color:T.text, fontSize:"0.87rem", fontFamily:"'DM Sans',sans-serif", lineHeight:1.65, resize:"vertical", outline:"none", minHeight:`${rows*22}px` }}
      placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
  );
}

function MD({ text }) {
  if (!text) return null;
  const html = text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/^## (.+)$/gm,`<h2 style="color:${T.teal};font-size:0.95rem;margin:1rem 0 0.25rem;font-weight:600">$1</h2>`)
    .replace(/^### (.+)$/gm,`<h3 style="color:${T.terra};font-size:0.75rem;text-transform:uppercase;letter-spacing:0.07em;margin:0.8rem 0 0.2rem">$1</h3>`)
    .replace(/^\d+\. (.+)$/gm,`<div style="display:flex;gap:8px;margin:4px 0;padding:6px 10px;background:${T.tealLt};border-radius:6px;border-left:2px solid ${T.teal}"><span>$1</span></div>`)
    .replace(/^- (.+)$/gm,`<div style="display:flex;gap:8px;margin:3px 0"><span style="color:${T.terra}">▸</span><span>$1</span></div>`)
    .replace(/\n\n/g,"<br/><br/>").replace(/\n/g,"<br/>");
  return <div style={{ color:T.text, lineHeight:1.7, fontSize:"0.86rem" }} dangerouslySetInnerHTML={{ __html:html }} />;
}

function PreBox({ text }) {
  return (
    <pre style={{ whiteSpace:"pre-wrap", wordBreak:"break-word", fontFamily:"monospace", fontSize:"0.77rem", lineHeight:1.75, color:T.text, background:T.bg, border:`1px solid ${T.border}`, borderRadius:12, padding:"1.25rem", maxHeight:380, overflowY:"auto", margin:0 }}>
      {text}
    </pre>
  );
}

function SkillRow({ skill, rating, onChange, isTop }) {
  const lbl = ["","Building","Learning","Proficient","Advanced","Expert"];
  const clr = [,T.terra,T.terra,T.tealMid,T.teal,T.teal];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"1rem", flexWrap:"wrap", padding:"0.7rem 1rem", borderRadius:10, marginBottom:"0.4rem", background:rating?T.tealLt:T.bg, border:`1px solid ${rating?T.teal:T.border}` }}>
      <div style={{ flex:1, display:"flex", alignItems:"center", gap:"0.4rem", minWidth:120 }}>
        {isTop && <span style={{ fontSize:"0.65rem", color:T.terra }}>★</span>}
        <span style={{ color:T.text, fontSize:"0.85rem" }}>{skill}</span>
      </div>
      <div style={{ display:"flex", gap:4 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{ width:30, height:30, borderRadius:7, border:"none", cursor:"pointer", background:rating>=n?clr[n]:T.bg, color:rating>=n?"#fff":T.muted, fontWeight:700, fontSize:"0.77rem", border:`1px solid ${rating>=n?clr[n]:T.border}` }}>{n}</button>
        ))}
        {rating > 0 && <span style={{ fontSize:"0.67rem", color:clr[rating], fontWeight:600, minWidth:60, marginLeft:4 }}>{lbl[rating]}</span>}
      </div>
    </div>
  );
}

function ScoreBadge({ score }) {
  const col = score >= 75 ? T.teal : score >= 55 ? T.terra : T.muted;
  return (
    <div style={{ width:52, height:52, borderRadius:"50%", border:`3px solid ${col}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, background:T.bg }}>
      <span style={{ fontSize:"0.85rem", fontWeight:800, color:col }}>{score}%</span>
    </div>
  );
}

function ScoreDial({ score }) {
  const r=36, c=2*Math.PI*r, pct=Math.min(100,Math.max(0,score));
  const col = pct>=75?T.teal:pct>=55?T.terra:T.muted;
  return (
    <div style={{ position:"relative", width:88, height:88, flexShrink:0 }}>
      <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform:"rotate(-90deg)" }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke={T.border} strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(pct/100)*c} ${c}`} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:"1.3rem", fontWeight:800, color:T.text, lineHeight:1 }}>{pct}</span>
        <span style={{ fontSize:"0.55rem", color:T.muted }}>/100</span>
      </div>
    </div>
  );
}

const FLOW_STEPS = [
  { key:"jd",     label:"Job",    icon:"01" },
  { key:"skills", label:"Skills", icon:"02" },
  { key:"rec",    label:"Match",  icon:"03" },
  { key:"resume", label:"Resume", icon:"04" },
  { key:"ats",    label:"ATS",    icon:"05" },
  { key:"cl",     label:"Cover",  icon:"06" },
];

function FlowStepper({ current }) {
  const idx = FLOW_STEPS.findIndex(s => s.key === current);
  return (
    <div style={{ display:"flex", marginBottom:"1.5rem" }}>
      {FLOW_STEPS.map((s,i) => {
        const done=i<idx, active=i===idx;
        return (
          <div key={s.key} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
            <div style={{ position:"relative", width:"100%", display:"flex", alignItems:"center" }}>
              {i>0 && <div style={{ flex:1, height:2, background:done?T.teal:T.border }} />}
              <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, background:done?T.teal:active?T.tealLt:T.bg, border:`2px solid ${done?T.teal:active?T.teal:T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.6rem", fontWeight:800, color:done?"#fff":active?T.teal:T.muted }}>{done?"✓":s.icon}</div>
              {i<FLOW_STEPS.length-1 && <div style={{ flex:1, height:2, background:done?T.teal:T.border }} />}
            </div>
            <span style={{ fontSize:"0.5rem", marginTop:"0.25rem", textTransform:"uppercase", textAlign:"center", color:active?T.teal:done?T.tealMid:T.muted, fontWeight:active?700:400 }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── main app ── */
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
  const [draftCompany, setDraftCompany] = useState("");
  const [draftHrRole, setDraftHrRole] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jd, setJd] = useState("");
  const [meta, setMeta] = useState({ jobTitle:"", company:"", seniority:"", roleType:"", topPriority:"" });
  const [skills, setSkills] = useState([]);
  const [ratings, setRatings] = useState({});
  const [recommendation, setRec] = useState("");
  const [resume, setResume] = useState("");
  const [atsReview, setAtsReview] = useState("");
  const [atsScore, setAtsScore] = useState(null);
  const [coverLetter, setCL] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const bottomRef = useRef(null);

  async function loadUserProfile(userId) {
    try {
      const { data } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
      if (data) {
        setProfile(data);
        if (data.user_role === "hr") { setUserRole("hr"); setPhase(PHASE.HR); loadCandidates(); }
        else { setUserRole("seeker"); setPhase(PHASE.HOME); }
      } else { setPhase(PHASE.ROLE_SELECT); }
    } catch { setPhase(PHASE.ROLE_SELECT); }
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [phase, loading]);

  useEffect(() => {
    const handleSession = async () => {
      const { data:{ session } } = await supabase.auth.getSession();
      if (session?.user) { setUser(session.user); loadUserProfile(session.user.id); }
      else { setPhase(PHASE.AUTH); }
    };
    handleSession();
    const { data:{ subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) { setUser(session.user); loadUserProfile(session.user.id); }
      else { setPhase(PHASE.AUTH); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (phase === PHASE.HOME && profile?.buckets?.length > 0) loadJobsForProfile(profile);
  }, [phase, profile]);

  async function loadJobsForProfile(p) {
    if (!p?.buckets?.length) return;
    setJobsLoading(true);
    const allJobs = [];
    for (const bucketId of p.buckets.slice(0,3)) {
      const searchTerm = BUCKET_SEARCH_TERMS[bucketId] || bucketId;
      const fetched = await fetchJobs(searchTerm, "India");
      for (const job of fetched) {
        job.matchScore = computeMatchScore(p.background, job);
        job.bucketLabel = INTEREST_BUCKETS.find(b => b.id === bucketId)?.label || bucketId;
        allJobs.push(job);
      }
    }
    allJobs.sort((a,b) => b.matchScore - a.matchScore);
    setJobs(allJobs);
    setJobsLoading(false);
  }

  async function signInWithGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:window.location.origin } });
    if (error) { setError(error.message); setLoading(false); }
  }

  async function signInWithEmail() {
    if (!emailInput || !passwordInput) { setError("Please enter your email and password."); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email:emailInput, password:passwordInput });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function signUpWithEmail() {
    if (!emailInput || !passwordInput) { setError("Please enter your email and a password to get started."); return; }
    if (passwordInput.length < 6) { setError("Choose a password with at least 6 characters."); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.signUp({ email:emailInput, password:passwordInput });
    if (error) setError(error.message);
    else setError("Check your email to confirm your account, then sign in.");
    setLoading(false);
  }

  async function saveProfile() {
    if (!draftBG.trim() || !user) return;
    setLoading(true); setError("");
    try {
      const { data, error } = await supabase.from("users")
        .upsert({ id:user.id, email:user.email, full_name:draftName.trim(), background:draftBG.trim(), buckets:draftBuckets }, { onConflict:"id" })
        .select().maybeSingle();
      if (error) setError(error.message);
      else { setProfile(data); setPhase(PHASE.HOME); }
    } catch { setError("Something went wrong — please try again."); }
    setLoading(false);
  }

  async function saveHrProfile() {
    if (!draftName.trim() || !user) return;
    setLoading(true); setError("");
    try {
      const { data, error } = await supabase.from("users")
        .upsert({ id:user.id, email:user.email, full_name:draftName.trim(), user_role:"hr", company_name:draftCompany.trim(), background:draftHrRole, buckets:draftBuckets }, { onConflict:"id" })
        .select().maybeSingle();
      if (error) setError(error.message);
      else { setProfile(data); setUserRole("hr"); setPhase(PHASE.HR); loadCandidates(); }
    } catch { setError("Something went wrong — please try again."); }
    setLoading(false);
  }

  async function saveAssessment(matchScore) {
    if (!user) return;
    await supabase.from("skill_assessments").insert({ user_id:user.id, role_target:meta.jobTitle, skills:ratings, match_score:matchScore });
  }

  async function loadCandidates() {
    const { data } = await supabase.from("skill_assessments").select("*, users(full_name, email)").order("created_at", { ascending:false });
    setCandidates(data || []);
  }

  async function logOutcome(assessmentId, outcome) {
    await supabase.from("job_outcomes").insert({ user_id:selectedCandidate.user_id, job_title:selectedCandidate.role_target, match_score:selectedCandidate.match_score, outcome });
    setSelectedCandidate(null);
    loadCandidates();
  }

  function selectJobForAnalysis(job) {
    setSelectedJob(job); setJd(job.description);
    setMeta({ jobTitle:job.title, company:job.company, seniority:"", roleType:"", topPriority:"" });
    setPhase(PHASE.SKILLS); setSkills([]); setRatings({});
  }

  const skillSummary = skills.map(s => `${s}: ${ratings[s]||"?"}/5`).join(", ");

  async function analyzeJD() {
    if (!jd.trim()) return;
    setLoading(true); setError("");
    try {
      const raw = await callClaude([{ role:"user", content:P.jdAnalysis(jd).msg }], P.jdAnalysis(jd).sys);
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setSkills(parsed.skills||[]);
      setMeta({ jobTitle:parsed.jobTitle||"", company:parsed.company||"", seniority:parsed.seniorityLevel||"", roleType:parsed.roleType||"", topPriority:parsed.topPriority||"" });
      setPhase(PHASE.SKILLS);
    } catch { setError("Paste the full job description for the best results."); }
    setLoading(false);
  }

  async function getRecommendation() {
    if (skills.some(s => !ratings[s])) { setError("Rate all skills to see your match score."); return; }
    setLoading(true); setError("");
    const res = await callClaude([{ role:"user", content:P.recommendation(jd,meta,skillSummary).msg }], P.recommendation(jd,meta,skillSummary).sys);
    const scoreMatch = res.match(/(\d+)\/100/);
    if (scoreMatch) await saveAssessment(parseInt(scoreMatch[1]));
    setRec(res); setPhase(PHASE.REC); setLoading(false);
  }

  async function tailorResume() {
    setLoading(true); setError("");
    const res = await callClaude([{ role:"user", content:P.resumeTailor(jd,meta,profile.background,skillSummary).msg }], P.resumeTailor(jd,meta,profile.background,skillSummary).sys);
    setResume(res); setPhase(PHASE.RESUME); setLoading(false);
  }

  async function runATS() {
    setLoading(true); setError("");
    const res = await callClaude([{ role:"user", content:P.atsReview(jd,meta,resume).msg }], P.atsReview(jd,meta,resume).sys);
    const m = res.match(/ATS Score:\s*(\d+)\/100/i);
    if (m) setAtsScore(parseInt(m[1]));
    setAtsReview(res); setPhase(PHASE.ATS); setLoading(false);
  }

  async function generateCL() {
    setLoading(true); setError("");
    const res = await callClaude([{ role:"user", content:P.coverLetter(jd,meta,resume,recommendation).msg }], P.coverLetter(jd,meta,resume,recommendation).sys);
    setCL(res); setPhase(PHASE.CL); setLoading(false);
  }

  function startManualJD() {
    setJd(""); setMeta({ jobTitle:"", company:"", seniority:"", roleType:"", topPriority:"" });
    setSkills([]); setRatings({}); setRec(""); setResume("");
    setAtsReview(""); setAtsScore(null); setCL(""); setError("");
    setSelectedJob(null); setPhase(PHASE.JD);
  }

  function startEditProfile() {
    setDraftName(profile?.full_name||""); setDraftBG(profile?.background||""); setDraftBuckets(profile?.buckets||[]);
    setPhase(PHASE.SETUP_INFO);
  }

  const inFlow = [PHASE.JD,PHASE.SKILLS,PHASE.REC,PHASE.RESUME,PHASE.ATS,PHASE.CL].includes(phase);

  /* ── input style ── */
  const inputStyle = { width:"100%", boxSizing:"border-box", background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"0.75rem", color:T.text, fontSize:"0.87rem", fontFamily:"'DM Sans',sans-serif", outline:"none" };
  const labelStyle = { display:"block", color:T.muted, fontSize:"0.72rem", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:"0.35rem" };

  return (
    <div style={{ background:T.bg, minHeight:"100vh", fontFamily:"'DM Sans',sans-serif", padding:"1.5rem 1rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,80%,100%{transform:translateY(0);opacity:0.5}40%{transform:translateY(-6px);opacity:1}}`}</style>

      <div style={{ maxWidth:720, margin:"0 auto" }}>

        {/* HEADER */}
        <header style={{ textAlign:"center", marginBottom:"1.5rem" }}>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(1.6rem,5vw,2.2rem)", fontWeight:800, color:T.teal, margin:"0 0 0.2rem" }}>
            Easy<span style={{ color:T.terra }}>Job</span>
          </h1>
          <p style={{ color:T.muted, fontSize:"0.8rem", margin:0 }}>AI-Powered Career Intelligence · Global</p>
          {user && (
            <button onClick={() => supabase.auth.signOut()} style={{ marginTop:"0.6rem", background:"transparent", border:`1px solid ${T.border}`, borderRadius:20, padding:"5px 14px", color:T.muted, fontSize:"0.75rem", cursor:"pointer" }}>
              Sign out
            </button>
          )}
        </header>

        {/* ERROR */}
        {error && (
          <div style={{ background:T.terraLt, border:`1px solid ${T.terra}`, borderRadius:10, padding:"0.75rem 1rem", marginBottom:"1rem", display:"flex", justifyContent:"space-between" }}>
            <span style={{ color:T.terraDk, fontSize:"0.82rem" }}>{error}</span>
            <button onClick={() => setError("")} style={{ background:"none", border:"none", color:T.terraDk, cursor:"pointer" }}>×</button>
          </div>
        )}

        {/* AUTH */}
        {phase === PHASE.AUTH && (
          <Card>
            <div style={{ textAlign:"center", padding:"0.5rem 0 1rem" }}>
              <div style={{ fontSize:"2rem", marginBottom:"0.75rem" }}>👋</div>
              <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1.3rem", color:T.teal, margin:"0 0 0.4rem" }}>Welcome to EasyJob</h2>
              <p style={{ color:T.muted, fontSize:"0.84rem", margin:"0 0 1.5rem" }}>Your AI-powered career intelligence platform.</p>

              <div style={{ display:"flex", gap:"0.5rem", justifyContent:"center", marginBottom:"1.25rem" }}>
                {["signin","signup"].map(m => (
                  <button key={m} onClick={() => setAuthMode(m)} style={{ padding:"0.4rem 1.25rem", borderRadius:20, border:`1px solid ${authMode===m?T.teal:T.border}`, background:authMode===m?T.teal:T.bg, color:authMode===m?"#fff":T.muted, fontSize:"0.8rem", fontWeight:600, cursor:"pointer" }}>
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem", maxWidth:340, margin:"0 auto 1.25rem" }}>
                <div>
                  <label style={{ ...labelStyle, textAlign:"left" }}>Email</label>
                  <input style={inputStyle} type="email" placeholder="you@example.com" value={emailInput} onChange={e => setEmailInput(e.target.value)} />
                </div>
                <div>
                  <label style={{ ...labelStyle, textAlign:"left" }}>Password</label>
                  <input style={inputStyle} type="password" placeholder="••••••••" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} />
                </div>
                {loading ? <Spinner /> : (
                  <Btn onClick={authMode==="signin"?signInWithEmail:signUpWithEmail}>
                    {authMode === "signin" ? "Sign in →" : "Create my account →"}
                  </Btn>
                )}
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", maxWidth:340, margin:"0 auto 1.25rem" }}>
                <div style={{ flex:1, height:1, background:T.border }} />
                <span style={{ color:T.muted, fontSize:"0.75rem" }}>or</span>
                <div style={{ flex:1, height:1, background:T.border }} />
              </div>

              <div style={{ display:"flex", justifyContent:"center" }}>
                <button onClick={signInWithGoogle} disabled={loading} style={{ display:"flex", alignItems:"center", gap:10, background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"0.75rem 1.5rem", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:"0.9rem", fontWeight:600, color:T.text }}>
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8.9 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.6 39.4 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.8l6.2 5.2C41 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                  Continue with Google
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ROLE SELECT */}
        {phase === PHASE.ROLE_SELECT && (
          <div style={{ animation:"fadeUp 0.3s ease forwards" }}>
            <div style={{ textAlign:"center", marginBottom:"1.75rem" }}>
              <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1.4rem", color:T.teal, margin:"0 0 0.5rem" }}>How will you use EasyJob?</h2>
              <p style={{ color:T.muted, fontSize:"0.85rem" }}>Choose the experience that fits you best</p>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
              {[
                { role:"seeker", icon:"👤", title:"I am looking for a job", desc:"Get matched to real jobs. AI resume tailoring. Skill tests. Real feedback." },
                { role:"hr",     icon:"🏢", title:"I am hiring",            desc:"Review pre-scored candidates. Build your pipeline. Log outcomes." },
              ].map(({ role, icon, title, desc }) => (
                <button key={role} onClick={() => { setUserRole(role); setPhase(role==="hr"?PHASE.HR_SETUP:PHASE.SETUP_INFO); }}
                  style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:"2rem 1.25rem", cursor:"pointer", textAlign:"center", transition:"all 0.2s", fontFamily:"'DM Sans',sans-serif" }}
                  onMouseOver={e => { e.currentTarget.style.borderColor=T.teal; e.currentTarget.style.background=T.tealLt; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.card; }}>
                  <div style={{ fontSize:"2.5rem", marginBottom:"0.75rem" }}>{icon}</div>
                  <div style={{ color:T.teal, fontSize:"1rem", fontWeight:700, fontFamily:"'Syne',sans-serif", marginBottom:"0.5rem" }}>{title}</div>
                  <div style={{ color:T.muted, fontSize:"0.78rem", lineHeight:1.5 }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* HR SETUP */}
        {phase === PHASE.HR_SETUP && (
          <Card>
            <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", marginBottom:"1rem" }}>
              <div style={{ width:24, height:24, borderRadius:"50%", background:T.teal, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.7rem", fontWeight:800, color:"#fff" }}>1</div>
              <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:0 }}>Set up your hiring profile</h2>
            </div>
            {[
              { label:"Your Name *", value:draftName, set:setDraftName, placeholder:"e.g. Rahul Sharma", type:"text" },
              { label:"Company / Organisation *", value:draftCompany, set:setDraftCompany, placeholder:"e.g. Zepto, McKinsey, Independent Recruiter", type:"text" },
            ].map(({ label, value, set, placeholder, type }) => (
              <div key={label} style={{ marginBottom:"1rem" }}>
                <label style={labelStyle}>{label}</label>
                <input style={inputStyle} type={type} placeholder={placeholder} value={value} onChange={e => set(e.target.value)} />
              </div>
            ))}
            <div style={{ marginBottom:"1rem" }}>
              <label style={labelStyle}>Your Role</label>
              <select value={draftHrRole} onChange={e => setDraftHrRole(e.target.value)} style={{ ...inputStyle }}>
                <option value="">Select your role</option>
                {["HR Manager","Talent Acquisition","Recruiter","Founder","Hiring Manager","Independent Recruiter"].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:"1.25rem" }}>
              <label style={labelStyle}>Roles you typically hire for</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.4rem" }}>
                {INTEREST_BUCKETS.map(b => {
                  const sel = draftBuckets.includes(b.id);
                  return (
                    <button key={b.id} onClick={() => setDraftBuckets(p => sel?p.filter(x=>x!==b.id):[...p,b.id])}
                      style={{ display:"flex", alignItems:"center", gap:"0.5rem", padding:"0.6rem 0.8rem", borderRadius:10, border:`1px solid ${sel?T.teal:T.border}`, background:sel?T.tealLt:T.card, cursor:"pointer" }}>
                      <span style={{ fontSize:"0.9rem" }}>{b.icon}</span>
                      <span style={{ fontSize:"0.78rem", color:sel?T.teal:T.muted, fontWeight:sel?600:400 }}>{b.label}</span>
                      {sel && <span style={{ marginLeft:"auto", color:T.teal, fontSize:"0.8rem" }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <Btn variant="secondary" onClick={() => setPhase(PHASE.ROLE_SELECT)}>← Back</Btn>
              <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={saveHrProfile} disabled={loading||!draftName.trim()||!draftCompany.trim()}>{loading?"Saving...":"Go to HR Dashboard →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* SETUP INFO */}
        {phase === PHASE.SETUP_INFO && (
          <Card>
            <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", marginBottom:"1rem" }}>
              <div style={{ width:24, height:24, borderRadius:"50%", background:T.teal, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.7rem", fontWeight:800, color:"#fff" }}>1</div>
              <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:0 }}>Your profile</h2>
              <span style={{ color:T.muted, fontSize:"0.75rem" }}>Step 1 of 2</span>
            </div>
            <div style={{ marginBottom:"1rem" }}>
              <label style={labelStyle}>Your Name</label>
              <input style={inputStyle} placeholder="e.g. Priya Sharma" value={draftName} onChange={e => setDraftName(e.target.value)} />
            </div>
            <label style={labelStyle}>Your Background & Resume *</label>
            <TA value={draftBG} onChange={setDraftBG} rows={11} placeholder={`Paste your resume or describe your background:\n\n• Work experience (company, role, dates, achievements)\n• Education & certifications\n• Technical skills & tools\n• Projects and notable wins`} />
            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:"1rem" }}>
              <Btn onClick={() => { if (draftBG.trim()) setPhase(PHASE.SETUP_BUCKETS); }} disabled={!draftBG.trim()}>Choose Interests →</Btn>
            </div>
          </Card>
        )}

        {/* SETUP BUCKETS */}
        {phase === PHASE.SETUP_BUCKETS && (
          <Card>
            <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", marginBottom:"0.5rem" }}>
              <div style={{ width:24, height:24, borderRadius:"50%", background:T.teal, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.7rem", fontWeight:800, color:"#fff" }}>2</div>
              <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:0 }}>What jobs do you want to see?</h2>
            </div>
            <p style={{ color:T.muted, fontSize:"0.78rem", margin:"0 0 1.2rem" }}>Select all that apply. EasyJob fetches real jobs from these areas for you.</p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.5rem", marginBottom:"1.2rem" }}>
              {INTEREST_BUCKETS.map(b => {
                const sel = draftBuckets.includes(b.id);
                return (
                  <button key={b.id} onClick={() => setDraftBuckets(p => sel?p.filter(x=>x!==b.id):[...p,b.id])}
                    style={{ display:"flex", alignItems:"center", gap:"0.5rem", padding:"0.7rem 0.9rem", borderRadius:10, border:`1px solid ${sel?T.teal:T.border}`, background:sel?T.tealLt:T.card, cursor:"pointer", textAlign:"left", transition:"all 0.15s" }}>
                    <span style={{ fontSize:"1rem" }}>{b.icon}</span>
                    <span style={{ fontSize:"0.8rem", color:sel?T.teal:T.muted, fontWeight:sel?600:400 }}>{b.label}</span>
                    {sel && <span style={{ marginLeft:"auto", color:T.teal, fontSize:"0.8rem" }}>✓</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <Btn variant="secondary" onClick={() => setPhase(PHASE.SETUP_INFO)}>← Back</Btn>
              <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={saveProfile} disabled={loading||draftBuckets.length===0}>{loading?"Saving...":"See My Jobs →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* HOME */}
        {phase === PHASE.HOME && userRole === "seeker" && (
          <div style={{ animation:"fadeUp 0.3s ease forwards" }}>
            <div style={{ background:T.tealLt, border:`1px solid ${T.teal}`, borderRadius:12, padding:"0.75rem 1rem", marginBottom:"1rem", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:T.teal, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700 }}>
                  {(profile?.full_name||user?.email||"U")[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ color:T.teal, fontSize:"0.85rem", fontWeight:600 }}>{profile?.full_name||user?.email}</div>
                  <div style={{ color:T.muted, fontSize:"0.72rem" }}>{profile?.buckets?.map(b=>INTEREST_BUCKETS.find(x=>x.id===b)?.label).filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              <button onClick={startEditProfile} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:6, padding:"4px 10px", color:T.muted, fontSize:"0.72rem", cursor:"pointer" }}>✏ Edit Profile</button>
            </div>

            <div style={{ marginBottom:"1rem" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"0.75rem" }}>
                <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:0 }}>Jobs matched for you</h2>
                {jobsLoading && <Spinner />}
                {!jobsLoading && jobs.length > 0 && <span style={{ color:T.muted, fontSize:"0.75rem" }}>{jobs.length} jobs found</span>}
              </div>

              {!jobsLoading && jobs.length === 0 && (
                <div style={{ padding:"1.5rem", textAlign:"center", color:T.muted, fontSize:"0.84rem", background:T.card, border:`1px solid ${T.border}`, borderRadius:12 }}>
                  Your job matches will appear here once your profile is set up.
                </div>
              )}

              {jobs.slice(0,10).map(job => (
                <div key={job.id} style={{ display:"flex", alignItems:"center", gap:"1rem", padding:"0.9rem 1rem", border:`1px solid ${T.border}`, borderRadius:12, marginBottom:"0.5rem", background:T.card, transition:"all 0.15s", cursor:"pointer" }}
                  onMouseOver={e => e.currentTarget.style.borderColor=T.teal}
                  onMouseOut={e => e.currentTarget.style.borderColor=T.border}>
                  <ScoreBadge score={job.matchScore} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:T.text, fontSize:"0.88rem", fontWeight:600, marginBottom:"0.15rem", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{job.title}</div>
                    <div style={{ color:T.muted, fontSize:"0.75rem" }}>{job.company} · {job.location}</div>
                    <span style={{ display:"inline-block", marginTop:"0.25rem", fontSize:"0.65rem", padding:"2px 7px", borderRadius:20, background:T.tealLt, color:T.teal }}>{job.bucketLabel}</span>
                  </div>
                  <Btn small onClick={() => selectJobForAnalysis(job)}>Analyse →</Btn>
                </div>
              ))}
            </div>

            <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:"1rem", textAlign:"center" }}>
              <p style={{ color:T.muted, fontSize:"0.8rem", marginBottom:"0.75rem" }}>Have a specific role in mind?</p>
              <Btn variant="terra" onClick={startManualJD}>Paste a Job Description →</Btn>
            </div>
          </div>
        )}

        {/* FLOW HEADER */}
        {inFlow && (
          <>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem", padding:"0.55rem 0.85rem", background:T.tealLt, border:`1px solid ${T.teal}`, borderRadius:10 }}>
              <span style={{ color:T.teal, fontSize:"0.7rem", fontWeight:700, textTransform:"uppercase" }}>
                {selectedJob ? `📋 ${selectedJob.title} · ${selectedJob.company}` : `✓ ${profile?.full_name||user?.email}`}
              </span>
              <button onClick={() => setPhase(PHASE.HOME)} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:6, padding:"3px 9px", color:T.muted, fontSize:"0.7rem", cursor:"pointer" }}>← Home</button>
            </div>
            <FlowStepper current={phase} />
          </>
        )}

        {/* JD */}
        {phase === PHASE.JD && (
          <Card>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:"0 0 0.25rem" }}>Paste the Job Description</h2>
            <p style={{ color:T.muted, fontSize:"0.75rem", margin:"0 0 0.9rem" }}>Include the full JD for the most accurate skill extraction.</p>
            <TA value={jd} onChange={setJd} rows={11} placeholder="Paste the full job description here..." />
            <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", gap:"1rem", marginTop:"1rem" }}>
              {loading && <Spinner />}
              <Btn onClick={analyzeJD} disabled={loading||!jd.trim()}>{loading?"Analysing...":"Extract Skills →"}</Btn>
            </div>
          </Card>
        )}

        {/* SKILLS */}
        {phase === PHASE.SKILLS && (
          <Card>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:"0 0 0.2rem" }}>Rate Your Skills</h2>
            <p style={{ color:T.muted, fontSize:"0.75rem", margin:"0 0 0.9rem" }}>
              {meta.jobTitle ? `${meta.jobTitle} at ${meta.company}` : selectedJob ? `${selectedJob.title} at ${selectedJob.company}` : "Be honest — this drives your match score."}
            </p>
            {skills.length === 0 && selectedJob && (
              <div style={{ padding:"1rem", background:T.tealLt, border:`1px solid ${T.teal}`, borderRadius:10, marginBottom:"1rem", textAlign:"center" }}>
                <p style={{ color:T.muted, fontSize:"0.82rem", margin:"0 0 0.75rem" }}>Extracting skills from this job description...</p>
                {loading ? <Spinner /> : (
                  <Btn small onClick={async () => {
                    setLoading(true);
                    try {
                      const raw = await callClaude([{ role:"user", content:P.jdAnalysis(selectedJob.description).msg }], P.jdAnalysis(selectedJob.description).sys);
                      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
                      setSkills(parsed.skills||[]);
                      setMeta({ jobTitle:parsed.jobTitle||selectedJob.title, company:parsed.company||selectedJob.company, seniority:parsed.seniorityLevel||"", roleType:parsed.roleType||"", topPriority:parsed.topPriority||"" });
                      setJd(selectedJob.description);
                    } catch { setError("Paste the full JD manually for best results."); }
                    setLoading(false);
                  }}>Extract Skills →</Btn>
                )}
              </div>
            )}
            {meta.topPriority && (
              <div style={{ padding:"0.5rem 0.85rem", background:T.terraLt, border:`1px solid ${T.terra}`, borderRadius:8, marginBottom:"0.9rem", fontSize:"0.75rem", color:T.terraDk }}>
                ★ Top priority for this role: {meta.topPriority}
              </div>
            )}
            {skills.map(s => <SkillRow key={s} skill={s} rating={ratings[s]||0} onChange={v => setRatings(r => ({...r,[s]:v}))} isTop={s===meta.topPriority} />)}
            {skills.length > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:"1rem" }}>
                <Btn variant="secondary" onClick={() => setPhase(PHASE.HOME)}>← Back</Btn>
                <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                  {loading && <Spinner />}
                  <Btn onClick={getRecommendation} disabled={loading||skills.some(s=>!ratings[s])}>{loading?"Scoring...":"See My Match Score →"}</Btn>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* RECOMMENDATION */}
        {phase === PHASE.REC && (
          <Card>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:"0 0 0.9rem" }}>Your Match Score</h2>
            <div style={{ background:T.bg, borderRadius:10, padding:"1rem", marginBottom:"1rem", border:`1px solid ${T.border}` }}><MD text={recommendation} /></div>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <Btn variant="secondary" onClick={() => setPhase(PHASE.SKILLS)}>← Adjust Ratings</Btn>
              <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={tailorResume} disabled={loading}>{loading?"Generating...":"Tailor My Resume →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* RESUME */}
        {phase === PHASE.RESUME && (
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.9rem" }}>
              <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:0 }}>Tailored Resume</h2>
              <button onClick={() => navigator.clipboard.writeText(resume)} style={{ background:T.tealLt, border:`1px solid ${T.border}`, borderRadius:7, padding:"3px 9px", color:T.teal, fontSize:"0.7rem", cursor:"pointer" }}>📋 Copy</button>
            </div>
            <PreBox text={resume} />
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:"1rem" }}>
              <Btn variant="secondary" onClick={() => setPhase(PHASE.REC)}>← Back</Btn>
              <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                {loading && <Spinner />}
                <Btn onClick={runATS} disabled={loading}>{loading?"Reviewing...":"Run ATS Review →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* ATS */}
        {phase === PHASE.ATS && (
          <>
            {atsScore !== null && (
              <div style={{ display:"flex", alignItems:"center", gap:"1.5rem", background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:"1.1rem 1.3rem", marginBottom:"0.9rem" }}>
                <ScoreDial score={atsScore} />
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"1.05rem", fontWeight:800, color:T.teal }}>
                    ATS Score: {atsScore>=75?"Strong":"Strengthen before applying"}
                  </div>
                  <div style={{ color:T.muted, fontSize:"0.76rem" }}>
                    {atsScore>=75?"Well-optimised for most ATS systems.":atsScore>=55?"A few targeted updates will improve your chances significantly.":"Focus on the keyword and structure suggestions below before applying."}
                  </div>
                </div>
              </div>
            )}
            <Card>
              <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:"0 0 0.9rem" }}>ATS & Hiring Manager Review</h2>
              <div style={{ background:T.bg, borderRadius:10, padding:"1rem", border:`1px solid ${T.border}` }}><MD text={atsReview} /></div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:"1rem" }}>
                <Btn variant="secondary" onClick={() => setPhase(PHASE.RESUME)}>← Resume</Btn>
                <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                  {loading && <Spinner />}
                  <Btn variant="terra" onClick={generateCL} disabled={loading}>{loading?"Writing...":"Generate Cover Letter →"}</Btn>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* COVER LETTER */}
        {phase === PHASE.CL && (
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.9rem" }}>
              <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1rem", color:T.teal, margin:0 }}>Cover Letter</h2>
              <button onClick={() => navigator.clipboard.writeText(coverLetter)} style={{ background:T.tealLt, border:`1px solid ${T.border}`, borderRadius:7, padding:"3px 9px", color:T.teal, fontSize:"0.7rem", cursor:"pointer" }}>📋 Copy</button>
            </div>
            <PreBox text={coverLetter} />
            <div style={{ marginTop:"0.9rem", padding:"0.7rem 0.9rem", background:T.tealLt, border:`1px solid ${T.teal}`, borderRadius:9 }}>
              <p style={{ color:T.teal, fontSize:"0.78rem", fontWeight:600, margin:"0 0 0.15rem" }}>✓ Application package complete!</p>
              <p style={{ color:T.muted, fontSize:"0.73rem", margin:0 }}>Resume and cover letter tailored for {meta.jobTitle} at {meta.company}.</p>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:"0.9rem" }}>
              <Btn variant="secondary" onClick={() => setPhase(PHASE.ATS)}>← ATS Review</Btn>
              <Btn onClick={() => setPhase(PHASE.HOME)}>Back to Home →</Btn>
            </div>
          </Card>
        )}

        {/* HR DASHBOARD */}
        {phase === PHASE.HR && (
          <div style={{ animation:"fadeUp 0.3s ease forwards" }}>
            {!selectedCandidate ? (
              <Card>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
                  <div>
                    <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"1.1rem", color:T.teal, margin:"0 0 0.2rem" }}>HR Dashboard</h2>
                    <p style={{ color:T.muted, fontSize:"0.75rem", margin:0 }}>Candidate Pipeline · {candidates.length} assessed</p>
                  </div>
                  <Btn small onClick={loadCandidates}>↻ Refresh</Btn>
                </div>
                <div style={{ padding:"0.6rem 0.9rem", background:T.terraLt, border:`1px solid ${T.terra}`, borderRadius:8, marginBottom:"1rem", fontSize:"0.74rem", color:T.terraDk }}>
                  Every outcome you log makes the EasyJob prediction engine more accurate.
                </div>
                {candidates.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"2rem", color:T.muted, fontSize:"0.84rem" }}>Candidate assessments will appear here as seekers complete their skill ratings.</div>
                ) : (
                  candidates.map(c => (
                    <div key={c.id} onClick={() => setSelectedCandidate(c)} style={{ display:"flex", alignItems:"center", gap:"1rem", padding:"0.8rem 0.9rem", border:`1px solid ${T.border}`, borderRadius:12, marginBottom:"0.5rem", cursor:"pointer", background:T.card, transition:"all 0.15s" }}
                      onMouseOver={e => { e.currentTarget.style.background=T.tealLt; e.currentTarget.style.borderColor=T.teal; }}
                      onMouseOut={e => { e.currentTarget.style.background=T.card; e.currentTarget.style.borderColor=T.border; }}>
                      <div style={{ width:38, height:38, borderRadius:"50%", background:T.tealLt, display:"flex", alignItems:"center", justifyContent:"center", color:T.teal, fontWeight:700, flexShrink:0 }}>
                        {(c.users?.full_name||c.users?.email||"?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ color:T.text, fontSize:"0.86rem", fontWeight:600 }}>{c.users?.full_name||c.users?.email||"Anonymous"}</div>
                        <div style={{ color:T.muted, fontSize:"0.73rem" }}>{c.role_target} · {new Date(c.created_at).toLocaleDateString("en-IN")}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"1.1rem", fontWeight:800, color:c.match_score>=75?T.teal:c.match_score>=55?T.terra:T.muted }}>{c.match_score||"—"}</div>
                        <div style={{ fontSize:"0.62rem", color:T.muted }}>score</div>
                      </div>
                    </div>
                  ))
                )}
              </Card>
            ) : (
              <Card>
                <button onClick={() => setSelectedCandidate(null)} style={{ background:T.tealLt, border:`1px solid ${T.border}`, borderRadius:6, padding:"4px 10px", color:T.teal, fontSize:"0.72rem", cursor:"pointer", marginBottom:"1rem" }}>← Pipeline</button>
                <div style={{ display:"flex", alignItems:"center", gap:"1rem", marginBottom:"1.1rem" }}>
                  <div style={{ width:46, height:46, borderRadius:"50%", background:T.tealLt, display:"flex", alignItems:"center", justifyContent:"center", color:T.teal, fontWeight:700, fontSize:"1rem" }}>
                    {(selectedCandidate.users?.full_name||"?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ color:T.text, fontSize:"0.95rem", fontWeight:600 }}>{selectedCandidate.users?.full_name||selectedCandidate.users?.email}</div>
                    <div style={{ color:T.muted, fontSize:"0.75rem" }}>Applied for {selectedCandidate.role_target}</div>
                  </div>
                  <div style={{ marginLeft:"auto", textAlign:"right" }}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"1.4rem", fontWeight:800, color:T.teal }}>{selectedCandidate.match_score||"—"}</div>
                    <div style={{ fontSize:"0.62rem", color:T.muted }}>match score</div>
                  </div>
                </div>
                <div style={{ marginBottom:"1.1rem" }}>
                  <div style={{ color:T.muted, fontSize:"0.7rem", fontWeight:600, textTransform:"uppercase", marginBottom:"0.5rem" }}>Self-Assessed Skills</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"0.35rem" }}>
                    {Object.entries(selectedCandidate.skills||{}).map(([skill,rating]) => (
                      <span key={skill} style={{ padding:"3px 10px", borderRadius:20, fontSize:"0.73rem", background:T.tealLt, color:T.teal }}>{skill}: {rating}/5</span>
                    ))}
                  </div>
                </div>
                <div style={{ color:T.muted, fontSize:"0.7rem", fontWeight:600, textTransform:"uppercase", marginBottom:"0.5rem" }}>Log Outcome</div>
                <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap" }}>
                  {[
                    { label:"Interview", icon:"📞", val:"interview" },
                    { label:"Shortlisted", icon:"⭐", val:"shortlisted" },
                    { label:"Offer", icon:"🎉", val:"offer" },
                    { label:"Another direction", icon:"→", val:"rejected" },
                    { label:"No response", icon:"👻", val:"ghosted" },
                  ].map(({ label, icon, val }) => (
                    <button key={val} onClick={() => logOutcome(selectedCandidate.id, val)} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:"0.76rem", cursor:"pointer", fontWeight:600 }}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
                <p style={{ color:T.muted, fontSize:"0.7rem", margin:"0.5rem 0 0" }}>Logging outcomes builds EasyJob's prediction accuracy over time.</p>
              </Card>
            )}
          </div>
        )}

        <div ref={bottomRef} />
        <p style={{ textAlign:"center", marginTop:"1.5rem", color:T.border, fontSize:"0.62rem", letterSpacing:"0.08em", textTransform:"uppercase" }}>EasyJob · Beta · Powered by Claude AI</p>
      </div>
    </div>
  );
}