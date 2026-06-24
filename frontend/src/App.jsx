import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const API_BASE = import.meta.env.VITE_API_URL || "";
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "",
  import.meta.env.VITE_SUPABASE_KEY || ""
);

/* ── tokens ── */
const T = {
  bg:      "#F0F0F0",
  card:    "#E3E3E3",
  cardHi:  "#FFFFFF",
  charcoal:"#2C2C2E",
  charMid: "#444446",
  gold:    "#C9962A",
  goldLt:  "#F5E6C8",
  goldDk:  "#9A6F1A",
  border:  "#D4D4D4",
  text:    "#1C1C1E",
  muted:   "#777777",
};

/* ── api ── */
async function callClaude(messages, systemPrompt) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ messages, system:systemPrompt, max_tokens:1500 }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||`Server error: ${res.status}`); }
  const data = await res.json();
  return data.content?.map(b=>b.text||"").join("")||"";
}

async function fetchJobs(role, location="India") {
  const res = await fetch(`${API_BASE}/api/jobs?role=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.jobs||[];
}

function computeMatchScore(resume, job) {
  if (!resume||!job) return 50;
  const r = resume.toLowerCase();
  const words = [...new Set((job.title+" "+job.description).toLowerCase().split(/\W+/).filter(w=>w.length>4))];
  const matches = words.filter(w=>r.includes(w)).length;
  return Math.min(95, Math.max(30, Math.round((matches/Math.max(words.length,1))*100)));
}

/* ── constants ── */
const BUCKETS = [
  {id:"product",       label:"Product Management",        icon:"🎯"},
  {id:"consulting",    label:"Consulting & Strategy",     icon:"👔"},
  {id:"chief-of-staff",label:"Chief of Staff",            icon:"👑"},
  {id:"fullstack",     label:"Full Stack Developer",      icon:"💻"},
  {id:"data-analyst",  label:"Business & Data Analyst",   icon:"📊"},
  {id:"marketing",     label:"Marketing & Growth",        icon:"📈"},
  {id:"finance",       label:"Finance & Banking",         icon:"🏦"},
  {id:"operations",    label:"Operations & Program Mgmt", icon:"⚙️"},
  {id:"social-sector", label:"Social Sector / NGO",       icon:"🌱"},
  {id:"hr",            label:"Human Resources",           icon:"🤝"},
];

const BUCKET_TERMS = {
  "product":"Product Manager","consulting":"Strategy Consultant",
  "chief-of-staff":"Chief of Staff","fullstack":"Full Stack Developer",
  "data-analyst":"Business Analyst","marketing":"Marketing Manager",
  "finance":"Finance Analyst","operations":"Operations Manager",
  "social-sector":"Program Manager NGO","hr":"HR Manager",
};

const INDUSTRIES = ["Technology","Finance & Banking","Consulting","Healthcare",
  "E-commerce","Manufacturing","Education","Media & Entertainment","Real Estate","Other"];

const CO_SIZES = ["1–10 (Startup)","11–50","51–200","201–500","501–2000","2000+ (Enterprise)"];

const JOB_TYPES = ["Full-time","Part-time","Contract","Freelance","Internship"];

/* ── phases ── */
const PH = {
  AUTH:"auth", ROLE_PICK:"role_pick", JOB_DETAIL:"job_detail",
  CAND_PROFILE:"cand_profile", CAND_BUCKETS:"cand_buckets", HOME:"home",
  JD:"jd", SKILLS:"skills", REC:"rec", RESUME:"resume", ATS:"ats", CL:"cl",
  CO_PROFILE:"co_profile", CO_HOME:"co_home", CO_POST:"co_post",
  CO_PIPELINE:"co_pipeline", CO_CANDIDATE:"co_candidate",
};

/* ── prompts ── */
const P = {
  jd: (jd) => ({
    sys:`You are a senior talent acquisition specialist.`,
    msg:`Extract 7-9 critical skills from this JD.\n\n${jd}\n\nJSON only:\n{"jobTitle":"","company":"","seniorityLevel":"","skills":[],"roleType":"","topPriority":""}`,
  }),
  rec: (jd,m,s) => ({
    sys:`Career coach. Positive, encouraging language. Frame gaps as growth opportunities.`,
    msg:`Fit for ${m.jobTitle} at ${m.company}.\nJD:${jd.substring(0,900)}\nSKILLS:${s}\n\n## Verdict\nApply with Confidence|Apply Strategically|Build These Skills First\n\n## Match Score\nX/100\n\n## Strongest Assets\n3 strengths.\n\n## Skills to Strengthen\n3 growth areas.\n\n## Action Plan\n2-3 steps.`,
  }),
  resume: (jd,m,bg,s) => ({
    sys:`FAANG resume strategist. ATS-optimized, achievement-driven.`,
    msg:`Tailored resume for ${m.jobTitle} at ${m.company}.\nJD:${jd.substring(0,800)}\nBG:${bg}\nSKILLS:${s}\n\n3-sentence Professional Summary. ## for sections.`,
  }),
  ats: (jd,m,r) => ({
    sys:`ATS system + hiring manager. Frame findings as opportunities.`,
    msg:`Review for ${m.jobTitle} at ${m.company}.\nJD:${jd.substring(0,600)}\nRESUME:${r.substring(0,1000)}\n\n## ATS Score: X/100\n## Keywords to Add\n## Hiring Manager Impression\n## Top 5 Improvements\n## Shortlist Probability`,
  }),
  cl: (jd,m,r) => ({
    sys:`Cover letter writer. Hook→Why You→Why Them→Close. Confident, active. Never "I am excited to apply."`,
    msg:`Cover letter for ${m.jobTitle} at ${m.company}.\nJD:${jd.substring(0,700)}\nRESUME:${r.substring(0,800)}\n~280 words. [Your Name] placeholder.`,
  }),
};

/* ══════════════════════════
   PRIMITIVES
══════════════════════════ */
function Spinner() {
  return (
    <div style={{display:"flex",gap:5,alignItems:"center",justifyContent:"center"}}>
      {[0,1,2].map(i=>(
        <span key={i} style={{width:7,height:7,borderRadius:"50%",background:T.charcoal,display:"block",animation:`pulse 1.1s ease ${i*0.18}s infinite`}}/>
      ))}
    </div>
  );
}

function Btn({children,onClick,disabled,variant="primary",small,full}) {
  const [hover,setHover] = useState(false);
  const [active,setActive] = useState(false);
  const base = {
    border:"none", borderRadius:10, cursor:disabled?"not-allowed":"pointer",
    fontWeight:600, fontFamily:"'Inter',sans-serif",
    opacity:disabled?0.45:1,
    padding:small?"0.45rem 1rem":"0.75rem 1.5rem",
    fontSize:small?"0.78rem":"0.87rem",
    width:full?"100%":"auto",
    transition:"transform 0.15s, box-shadow 0.15s, background 0.15s",
    transform:active?"scale(0.97)":hover?"scale(1.02)":"scale(1)",
    boxShadow:hover&&!disabled?"0 4px 12px rgba(0,0,0,0.15)":"0 2px 4px rgba(0,0,0,0.08)",
    display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
  };
  const styles = {
    primary:  {...base, background:T.charcoal, color:"#fff"},
    gold:     {...base, background:T.gold,     color:"#fff", boxShadow:hover?"0 4px 12px rgba(201,150,42,0.4)":"0 2px 4px rgba(201,150,42,0.2)"},
    secondary:{...base, background:T.cardHi,  color:T.charcoal, border:`1px solid ${T.border}`},
    ghost:    {...base, background:"transparent", color:T.muted, border:`1px solid ${T.border}`},
  };
  return (
    <button
      style={styles[variant]||styles.primary}
      onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>{setHover(false);setActive(false);}}
      onMouseDown={()=>setActive(true)} onMouseUp={()=>setActive(false)}>
      {children}
    </button>
  );
}

function Card({children,style:sx,animate,delay=0}) {
  return (
    <div style={{
      background:T.cardHi, border:`1px solid ${T.border}`, borderRadius:16,
      padding:"1.5rem",
      animation:animate!==false?`fadeUp 0.35s ease ${delay}s both`:"none",
      transition:"box-shadow 0.2s, transform 0.2s",
      ...sx,
    }}
    onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.1)";e.currentTarget.style.transform="translateY(-2px)";}}
    onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="translateY(0)";}}>
      {children}
    </div>
  );
}

function SurfaceCard({children,style:sx,delay=0}) {
  return (
    <div style={{
      background:T.card, border:`1px solid ${T.border}`, borderRadius:12,
      padding:"1rem", animation:`fadeUp 0.35s ease ${delay}s both`, ...sx,
    }}>
      {children}
    </div>
  );
}

function Input({label,value,onChange,placeholder,type="text",optional}) {
  const [focus,setFocus] = useState(false);
  return (
    <div style={{marginBottom:"1rem"}}>
      <label style={{display:"flex",alignItems:"center",gap:6,color:T.muted,fontSize:"0.72rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.35rem"}}>
        {label}{optional&&<span style={{fontSize:"0.65rem",fontWeight:400,textTransform:"none",letterSpacing:0}}>— optional</span>}
      </label>
      <input type={type} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}
        onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
        style={{width:"100%",boxSizing:"border-box",background:T.cardHi,border:`1.5px solid ${focus?T.charcoal:T.border}`,borderRadius:10,padding:"0.75rem",color:T.text,fontSize:"0.87rem",outline:"none",transition:"border-color 0.15s, box-shadow 0.15s",boxShadow:focus?`0 0 0 3px rgba(44,44,46,0.08)`:"none"}}/>
    </div>
  );
}

function Select({label,value,onChange,options,placeholder}) {
  return (
    <div style={{marginBottom:"1rem"}}>
      <label style={{display:"block",color:T.muted,fontSize:"0.72rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.35rem"}}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:"100%",boxSizing:"border-box",background:T.cardHi,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"0.75rem",color:value?T.text:T.muted,fontSize:"0.87rem",outline:"none"}}>
        <option value="">{placeholder}</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function TA({label,value,onChange,placeholder,rows=8,optional}) {
  const [focus,setFocus] = useState(false);
  return (
    <div style={{marginBottom:"1rem"}}>
      {label&&<label style={{display:"flex",alignItems:"center",gap:6,color:T.muted,fontSize:"0.72rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.35rem"}}>
        {label}{optional&&<span style={{fontSize:"0.65rem",fontWeight:400,textTransform:"none",letterSpacing:0}}>— optional</span>}
      </label>}
      <textarea placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}
        onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
        style={{width:"100%",boxSizing:"border-box",background:T.cardHi,border:`1.5px solid ${focus?T.charcoal:T.border}`,borderRadius:10,padding:"0.85rem",color:T.text,fontSize:"0.87rem",lineHeight:1.65,resize:"vertical",outline:"none",minHeight:`${rows*22}px`,transition:"border-color 0.15s"}}/>
    </div>
  );
}

function StepBadge({n}) {
  return <div style={{width:26,height:26,borderRadius:"50%",background:T.charcoal,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.7rem",fontWeight:800,color:"#fff",flexShrink:0}}>{n}</div>;
}

function SectionHeader({step,total,title}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"1.25rem"}}>
      <StepBadge n={step}/>
      <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:0}}>{title}</h2>
      {total&&<span style={{color:T.muted,fontSize:"0.75rem"}}>Step {step} of {total}</span>}
    </div>
  );
}

function MD({text}) {
  if (!text) return null;
  const html = text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/^## (.+)$/gm,`<h2 style="color:${T.charcoal};font-size:0.95rem;margin:1rem 0 0.3rem;font-weight:600">$1</h2>`)
    .replace(/^### (.+)$/gm,`<h3 style="color:${T.gold};font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;margin:0.8rem 0 0.2rem">$1</h3>`)
    .replace(/^\d+\. (.+)$/gm,`<div style="display:flex;gap:8px;margin:4px 0;padding:7px 10px;background:${T.card};border-radius:8px;border-left:2px solid ${T.charcoal}"><span>$1</span></div>`)
    .replace(/^- (.+)$/gm,`<div style="display:flex;gap:8px;margin:3px 0"><span style="color:${T.gold}">▸</span><span>$1</span></div>`)
    .replace(/\n\n/g,"<br/><br/>").replace(/\n/g,"<br/>");
  return <div style={{color:T.text,lineHeight:1.7,fontSize:"0.86rem"}} dangerouslySetInnerHTML={{__html:html}}/>;
}

function PreBox({text}) {
  return <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontFamily:"monospace",fontSize:"0.77rem",lineHeight:1.75,color:T.text,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"1.25rem",maxHeight:380,overflowY:"auto",margin:0}}>{text}</pre>;
}

function SkillRow({skill,rating,onChange,isTop}) {
  const lbl=["","Building","Learning","Proficient","Advanced","Expert"];
  const clr=[,T.muted,T.muted,T.charMid,T.charcoal,T.charcoal];
  return (
    <div style={{display:"flex",alignItems:"center",gap:"1rem",flexWrap:"wrap",padding:"0.7rem 1rem",borderRadius:10,marginBottom:"0.4rem",background:rating?T.goldLt:T.card,border:`1px solid ${rating?T.gold:T.border}`,transition:"all 0.2s"}}>
      <div style={{flex:1,display:"flex",alignItems:"center",gap:"0.4rem",minWidth:120}}>
        {isTop&&<span style={{fontSize:"0.65rem",color:T.gold}}>★</span>}
        <span style={{color:T.text,fontSize:"0.85rem"}}>{skill}</span>
      </div>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        {[1,2,3,4,5].map(n=>(
          <button key={n} onClick={()=>onChange(n)}
            style={{width:30,height:30,borderRadius:7,border:`1px solid ${rating>=n?clr[n]:T.border}`,cursor:"pointer",background:rating>=n?clr[n]:T.cardHi,color:rating>=n?"#fff":T.muted,fontWeight:700,fontSize:"0.77rem",transition:"all 0.15s",transform:"scale(1)",}}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>{n}</button>
        ))}
        {rating>0&&<span style={{fontSize:"0.67rem",color:clr[rating],fontWeight:600,minWidth:60,marginLeft:4}}>{lbl[rating]}</span>}
      </div>
    </div>
  );
}

function ScoreBadge({score}) {
  const col=score>=75?T.charcoal:score>=55?T.gold:T.muted;
  return (
    <div style={{width:52,height:52,borderRadius:"50%",border:`3px solid ${col}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:T.cardHi,animation:score>=75?"goldPulse 2s infinite":"none"}}>
      <span style={{fontSize:"0.82rem",fontWeight:800,color:col}}>{score}%</span>
    </div>
  );
}

function ScoreDial({score}) {
  const r=36,c=2*Math.PI*r,pct=Math.min(100,Math.max(0,score));
  const col=pct>=75?T.charcoal:pct>=55?T.gold:T.muted;
  return (
    <div style={{position:"relative",width:88,height:88,flexShrink:0}}>
      <svg width="88" height="88" viewBox="0 0 88 88" style={{transform:"rotate(-90deg)"}}>
        <circle cx="44" cy="44" r={r} fill="none" stroke={T.border} strokeWidth="8"/>
        <circle cx="44" cy="44" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(pct/100)*c} ${c}`} style={{transition:"stroke-dasharray 0.8s ease"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:"1.3rem",fontWeight:800,color:T.text,lineHeight:1}}>{pct}</span>
        <span style={{fontSize:"0.55rem",color:T.muted}}>/100</span>
      </div>
    </div>
  );
}

function GoldTag({children}) {
  return <span style={{background:T.goldLt,color:T.goldDk,fontSize:"0.7rem",fontWeight:600,padding:"3px 10px",borderRadius:20,border:`1px solid ${T.gold}`}}>{children}</span>;
}

function DarkTag({children}) {
  return <span style={{background:T.charcoal,color:"#fff",fontSize:"0.7rem",fontWeight:600,padding:"3px 10px",borderRadius:20}}>{children}</span>;
}

const FLOW_STEPS=[
  {key:"job_detail",label:"Job",icon:"01"},{key:"skills",label:"Skills",icon:"02"},
  {key:"rec",label:"Match",icon:"03"},{key:"resume",label:"Resume",icon:"04"},
  {key:"ats",label:"ATS",icon:"05"},{key:"cl",label:"Cover",icon:"06"},
];

function FlowStepper({current}) {
  const idx=FLOW_STEPS.findIndex(s=>s.key===current);
  return (
    <div style={{display:"flex",marginBottom:"1.5rem"}}>
      {FLOW_STEPS.map((s,i)=>{
        const done=i<idx,active=i===idx;
        return (
          <div key={s.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{position:"relative",width:"100%",display:"flex",alignItems:"center"}}>
              {i>0&&<div style={{flex:1,height:2,background:done?T.charcoal:T.border,transition:"background 0.3s"}}/>}
              <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,background:done?T.charcoal:active?T.goldLt:T.card,border:`2px solid ${done?T.charcoal:active?T.gold:T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.6rem",fontWeight:800,color:done?"#fff":active?T.gold:T.muted,transition:"all 0.3s"}}>{done?"✓":s.icon}</div>
              {i<FLOW_STEPS.length-1&&<div style={{flex:1,height:2,background:done?T.charcoal:T.border,transition:"background 0.3s"}}/>}
            </div>
            <span style={{fontSize:"0.5rem",marginTop:"0.25rem",textTransform:"uppercase",textAlign:"center",color:active?T.gold:done?T.charcoal:T.muted,fontWeight:active?700:400}}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function JobCard({job,onAnalyse,delay=0}) {
  const [hover,setHover]=useState(false);
  return (
    <div style={{display:"flex",alignItems:"center",gap:"1rem",padding:"0.9rem 1rem",border:`1px solid ${hover?T.charcoal:T.border}`,borderRadius:12,marginBottom:"0.5rem",background:T.cardHi,transition:"all 0.2s",transform:hover?"translateX(4px)":"translateX(0)",animation:`slideRight 0.3s ease ${delay}s both`,cursor:"pointer"}}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <ScoreBadge score={job.matchScore}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:T.text,fontSize:"0.88rem",fontWeight:600,marginBottom:"0.15rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{job.title}</div>
        <div style={{color:T.muted,fontSize:"0.75rem"}}>{job.company} · {job.location}</div>
        <div style={{marginTop:"0.3rem"}}><GoldTag>{job.bucketLabel}</GoldTag></div>
      </div>
      <Btn small onClick={()=>onAnalyse(job)}>Analyse →</Btn>
    </div>
  );
}

function CandidateRow({c,onClick,rank,delay=0}) {
  const [hover,setHover]=useState(false);
  const score=c.match_score||0;
  const col=score>=75?T.charcoal:score>=55?T.gold:T.muted;
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:"1rem",padding:"0.8rem 0.9rem",border:`1px solid ${hover?T.charcoal:T.border}`,borderRadius:12,marginBottom:"0.5rem",cursor:"pointer",background:T.cardHi,transition:"all 0.2s",transform:hover?"translateX(4px)":"translateX(0)",animation:`slideRight 0.3s ease ${delay}s both`}}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      {rank!==undefined&&<div style={{width:22,height:22,borderRadius:"50%",background:rank<3?T.charcoal:T.card,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.65rem",fontWeight:700,color:rank<3?"#fff":T.muted,flexShrink:0}}>{rank+1}</div>}
      <div style={{width:36,height:36,borderRadius:"50%",background:T.card,display:"flex",alignItems:"center",justifyContent:"center",color:T.charcoal,fontWeight:700,flexShrink:0,fontSize:"0.9rem"}}>
        {(c.users?.full_name||c.users?.email||"?")[0].toUpperCase()}
      </div>
      <div style={{flex:1}}>
        <p style={{fontSize:"0.86rem",fontWeight:600,color:T.text,margin:"0 0 2px"}}>{c.users?.full_name||c.users?.email||"Anonymous"}</p>
        <p style={{fontSize:"0.73rem",color:T.muted,margin:0}}>{c.role_target}</p>
      </div>
      <div style={{textAlign:"right"}}>
        <p style={{fontFamily:"'Syne',sans-serif",fontSize:"1.1rem",fontWeight:800,color:col,margin:0}}>{score||"—"}</p>
        <p style={{fontSize:"0.62rem",color:T.muted,margin:0}}>score</p>
      </div>
    </div>
  );
}

/* ══════════════════════════
   MAIN APP
══════════════════════════ */
export default function App() {
  const [phase,setPhase]   = useState(PH.AUTH);
  const [user,setUser]     = useState(null);
  const [loading,setLoad]  = useState(false);
  const [error,setError]   = useState("");
  const [authMode,setAuthMode]       = useState("signin");
  const [authPersona,setAuthPersona] = useState("candidate");
  const [email,setEmail]     = useState("");
  const [password,setPassword] = useState("");

  /* candidate */
  const [candProfile,setCandProfile] = useState(null);
  const [dName,setDName]   = useState("");
  const [dBG,setDBG]       = useState("");
  const [dSkills,setDSkills]   = useState("");
  const [dLoc,setDLoc]     = useState("");
  const [dSalary,setDSalary]   = useState("");
  const [dBuckets,setDBuckets] = useState([]);
  const [jobs,setJobs]     = useState([]);
  const [jobsLoading,setJobsLoading] = useState(false);
  const [selJob,setSelJob] = useState(null);
  const [jd,setJd]         = useState("");
  const [meta,setMeta]     = useState({jobTitle:"",company:"",seniority:"",roleType:"",topPriority:""});
  const [skills,setSkills] = useState([]);
  const [ratings,setRatings] = useState({});
  const [rec,setRec]       = useState("");
  const [resume,setResume] = useState("");
  const [atsReview,setAtsReview] = useState("");
  const [atsScore,setAtsScore]   = useState(null);
  const [cl,setCl]         = useState("");

  /* company */
  const [coProfile,setCoProfile]   = useState(null);
  const [coName,setCoName]         = useState("");
  const [coIndustry,setCoIndustry] = useState("");
  const [coSize,setCoSize]         = useState("");
  const [coWebsite,setCoWebsite]   = useState("");
  const [coContact,setCoContact]   = useState("");
  const [coJobs,setCoJobs]         = useState([]);
  const [candidates,setCandidates] = useState([]);
  const [selCand,setSelCand]       = useState(null);
  const [selCoJob,setSelCoJob]     = useState(null);
  const [jpTitle,setJpTitle]   = useState("");
  const [jpJD,setJpJD]         = useState("");
  const [jpLoc,setJpLoc]       = useState("");
  const [jpType,setJpType]     = useState("");
  const [jpSalary,setJpSalary] = useState("");
  const [jpDeadline,setJpDeadline] = useState("");

  const [profileOpen, setProfileOpen] = useState(false);
  const bottomRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(()=>{ window.history.replaceState(null,"",window.location.pathname); },[]);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[phase,loading]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if (session?.user) { setUser(session.user); loadProfile(session.user); }
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_e,session)=>{
      if (session?.user) { setUser(session.user); loadProfile(session.user); }
      else { setUser(null); setPhase(PH.AUTH); }
    });
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if (phase===PH.HOME && candProfile?.buckets?.length>0) loadJobs(candProfile);
  },[phase,candProfile]);

  async function loadProfile(u) {
    try {
      const {data} = await supabase.from("users").select("*").eq("id",u.id).maybeSingle();
      if (!data || !data.user_role) {
        // Google OAuth user — no role set yet, send to role picker
        setPhase(PH.ROLE_PICK);
        return;
      }
      if (data.user_role==="company") {
        setCoProfile(data); loadCoJobs(data.id); loadCandidates(); setPhase(PH.CO_HOME);
      } else {
        setCandProfile(data);
        setPhase(data.background ? PH.HOME : PH.CAND_PROFILE);
      }
    } catch { setPhase(PH.AUTH); }
  }

  async function loadJobs(p) {
    if (!p?.buckets?.length) return;
    setJobsLoading(true);
    const all=[];
    for (const bid of p.buckets.slice(0,3)) {
      const fetched = await fetchJobs(BUCKET_TERMS[bid]||bid, p.preferred_location||"India");
      for (const job of fetched) {
        job.matchScore = computeMatchScore(p.background,job);
        job.bucketLabel = BUCKETS.find(b=>b.id===bid)?.label||bid;
        all.push(job);
      }
    }
    all.sort((a,b)=>b.matchScore-a.matchScore);
    setJobs(all); setJobsLoading(false);
  }

  async function loadCoJobs(uid) {
    const {data} = await supabase.from("job_posts").select("*").eq("hr_user_id",uid).order("created_at",{ascending:false});
    setCoJobs(data||[]);
  }

  async function loadCandidates() {
    const {data} = await supabase.from("skill_assessments").select("*, users(full_name, email)").order("created_at",{ascending:false});
    setCandidates(data||[]);
  }

  /* ── auth ── */
  async function googleAuth() {
    setLoad(true);
    window.history.replaceState(null,"",window.location.pathname);
    const {error} = await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}});
    if (error) { setError(error.message); setLoad(false); }
  }

  async function emailAuth() {
    if (!email||!password) { setError("Please enter your email and password."); return; }
    setLoad(true); setError("");
    if (authMode==="signup") {
      if (password.length<6) { setError("Choose a password with at least 6 characters."); setLoad(false); return; }
      const {data,error} = await supabase.auth.signUp({email,password});
      if (error) { setError(error.message); setLoad(false); return; }
      if (data.user) {
        await supabase.from("users").upsert({id:data.user.id,email:data.user.email,user_role:authPersona},{onConflict:"id"});
        setUser(data.user);
        setPhase(authPersona==="company"?PH.CO_PROFILE:PH.CAND_PROFILE);
      } else { setError("Check your email to confirm your account, then sign in."); }
    } else {
      const {error} = await supabase.auth.signInWithPassword({email,password});
      if (error) setError(error.message);
    }
    setLoad(false);
  }

  async function saveRoleAndContinue(role) {
    if (!user) return;
    setLoad(true);
    const { error } = await supabase.from("users").upsert(
      { id:user.id, email:user.email, user_role:role },
      { onConflict:"id" }
    );
    if (error) { setError(error.message); setLoad(false); return; }
    setLoad(false);
    if (role === "company") setPhase(PH.CO_PROFILE);
    else setPhase(PH.CAND_PROFILE);
  }

  async function forgotPassword() {
    if (!email) { setError("Enter your email address above first."); return; }
    setLoad(true); setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) setError(error.message);
    else setError("✓ Password reset link sent — check your inbox.");
    setLoad(false);
  }

  /* ── candidate ── */
  async function saveCandProfile() {
    if (!dBG.trim()||!user) return;
    setLoad(true); setError("");
    try {
      const {data,error} = await supabase.from("users").upsert({
        id:user.id,email:user.email,full_name:dName.trim(),user_role:"candidate",
        background:dBG.trim(),skills_summary:dSkills.trim(),
        preferred_location:dLoc.trim(),salary_expectation:dSalary.trim()||null,
        buckets:dBuckets,
      },{onConflict:"id"}).select().maybeSingle();
      if (error) setError(error.message);
      else { setCandProfile(data); setPhase(PH.HOME); }
    } catch { setError("Something went wrong — please try again."); }
    setLoad(false);
  }

  function editCandProfile() {
    setDName(candProfile?.full_name||""); setDBG(candProfile?.background||"");
    setDSkills(candProfile?.skills_summary||""); setDLoc(candProfile?.preferred_location||"");
    setDSalary(candProfile?.salary_expectation||""); setDBuckets(candProfile?.buckets||[]);
    setPhase(PH.CAND_PROFILE);
  }

  async function saveAssessment(score) {
    if (!user) return;
    await supabase.from("skill_assessments").insert({user_id:user.id,role_target:meta.jobTitle,skills:ratings,match_score:score});
  }

  const skillSummary = skills.map(s=>`${s}: ${ratings[s]||"?"}/5`).join(", ");

  async function analyzeJD() {
    if (!jd.trim()) return;
    setLoad(true); setError("");
    try {
      const raw = await callClaude([{role:"user",content:P.jd(jd).msg}],P.jd(jd).sys);
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setSkills(parsed.skills||[]);
      setMeta({jobTitle:parsed.jobTitle||"",company:parsed.company||"",seniority:parsed.seniorityLevel||"",roleType:parsed.roleType||"",topPriority:parsed.topPriority||""});
      setPhase(PH.SKILLS);
    } catch { setError("Paste the full job description for best results."); }
    setLoad(false);
  }

  async function getRec() {
    if (skills.some(s=>!ratings[s])) { setError("Rate all skills to see your match score."); return; }
    setLoad(true); setError("");
    const res = await callClaude([{role:"user",content:P.rec(jd,meta,skillSummary).msg}],P.rec(jd,meta,skillSummary).sys);
    const m = res.match(/(\d+)\/100/);
    if (m) await saveAssessment(parseInt(m[1]));
    setRec(res); setPhase(PH.REC); setLoad(false);
  }

  async function tailorResume() {
    setLoad(true); setError("");
    const res = await callClaude([{role:"user",content:P.resume(jd,meta,candProfile.background,skillSummary).msg}],P.resume(jd,meta,candProfile.background,skillSummary).sys);
    setResume(res); setPhase(PH.RESUME); setLoad(false);
  }

  async function runATS() {
    setLoad(true); setError("");
    const res = await callClaude([{role:"user",content:P.ats(jd,meta,resume).msg}],P.ats(jd,meta,resume).sys);
    const m = res.match(/ATS Score:\s*(\d+)\/100/i);
    if (m) setAtsScore(parseInt(m[1]));
    setAtsReview(res); setPhase(PH.ATS); setLoad(false);
  }

  async function genCL() {
    setLoad(true); setError("");
    const res = await callClaude([{role:"user",content:P.cl(jd,meta,resume).msg}],P.cl(jd,meta,resume).sys);
    setCl(res); setPhase(PH.CL); setLoad(false);
  }

  function startManualJD() {
    setJd(""); setMeta({jobTitle:"",company:"",seniority:"",roleType:"",topPriority:""});
    setSkills([]); setRatings({}); setRec(""); setResume(""); setAtsReview(""); setAtsScore(null); setCl(""); setError("");
    setSelJob(null); setPhase(PH.JD);
  }

  function selectJob(job) {
    setSelJob(job); setJd(job.description);
    setMeta({jobTitle:job.title,company:job.company,seniority:"",roleType:"",topPriority:""});
    setSkills([]); setRatings({}); setError("");
    setPhase(PH.JOB_DETAIL);
  }

  /* ── company ── */
  async function saveCoProfile() {
    if (!coName.trim()||!coIndustry||!user) return;
    setLoad(true); setError("");
    try {
      const {data,error} = await supabase.from("users").upsert({
        id:user.id,email:user.email,full_name:coContact.trim(),
        user_role:"company",company_name:coName.trim(),
        industry:coIndustry,company_size:coSize,company_website:coWebsite.trim(),
      },{onConflict:"id"}).select().maybeSingle();
      if (error) setError(error.message);
      else { setCoProfile(data); setPhase(PH.CO_HOME); }
    } catch { setError("Something went wrong — please try again."); }
    setLoad(false);
  }

  async function postJob() {
    if (!jpTitle.trim()||!jpJD.trim()||!user) return;
    setLoad(true); setError("");
    try {
      const {error} = await supabase.from("job_posts").insert({
        hr_user_id:user.id,title:jpTitle.trim(),company_display:coProfile?.company_name||"",
        location:jpLoc.trim(),jd:jpJD.trim(),job_type:jpType,
        salary_range:jpSalary.trim(),deadline:jpDeadline||null,status:"active",
      });
      if (error) setError(error.message);
      else {
        setJpTitle(""); setJpJD(""); setJpLoc(""); setJpType(""); setJpSalary(""); setJpDeadline("");
        loadCoJobs(user.id); setPhase(PH.CO_HOME);
      }
    } catch { setError("Something went wrong — please try again."); }
    setLoad(false);
  }

  async function logOutcome(outcome) {
    if (!selCand) return;
    await supabase.from("job_outcomes").insert({user_id:selCand.user_id,job_title:selCand.role_target,match_score:selCand.match_score,outcome});
    setSelCand(null); loadCandidates();
  }

  const inFlow=[PH.JOB_DETAIL,PH.JD,PH.SKILLS,PH.REC,PH.RESUME,PH.ATS,PH.CL].includes(phase);

  /* ── shared nav strip ── */
  function NavStrip({label,onBack}) {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",padding:"0.6rem 1rem",background:T.charcoal,borderRadius:10,animation:"fadeIn 0.3s ease"}}>
        <span style={{color:"#fff",fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</span>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:6,padding:"3px 10px",color:"rgba(255,255,255,0.7)",fontSize:"0.72rem",cursor:"pointer",transition:"background 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>← Back</button>
      </div>
    );
  }

  /* ══════════════════════════
     RENDER
  ══════════════════════════ */
  return (
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"'Inter',sans-serif",padding:"1.5rem 1rem"}}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideRight{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
        @keyframes pulse{0%,80%,100%{transform:translateY(0);opacity:0.4}40%{transform:translateY(-7px);opacity:1}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
        @keyframes goldPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,150,42,0.3)}50%{box-shadow:0 0 0 6px rgba(201,150,42,0)}}
        input::placeholder,textarea::placeholder{color:${T.muted};opacity:0.6}
        select option{color:${T.text};background:#fff}
      `}</style>

      <div style={{maxWidth:720,margin:"0 auto"}}>

        {/* HEADER */}
        <header style={{marginBottom:"1.5rem",animation:"fadeUp 0.3s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.75rem 1rem",background:T.cardHi,border:`1px solid ${T.border}`,borderRadius:14}}>
            {/* logo */}
            <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:"1.5rem",fontWeight:800,color:T.charcoal,margin:0}}>
              Easy<span style={{color:T.gold}}>Job</span>
            </h1>

            {/* subtitle — hidden on small screens */}
            <p style={{color:T.muted,fontSize:"0.75rem",margin:0,display:"none"}}>AI-Powered Career Intelligence</p>

            {/* right side */}
            <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
              {!user&&(
                <Btn small onClick={()=>setPhase(PH.AUTH)}>Sign in</Btn>
              )}
              {user&&(
                <div style={{position:"relative"}} ref={profileRef}>
                  {/* avatar button */}
                  <button onClick={()=>setProfileOpen(o=>!o)}
                    style={{display:"flex",alignItems:"center",gap:8,background:profileOpen?T.charcoal:T.card,border:`1px solid ${profileOpen?T.charcoal:T.border}`,borderRadius:24,padding:"5px 12px 5px 6px",cursor:"pointer",transition:"all 0.2s"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:"0.78rem",flexShrink:0}}>
                      {(candProfile?.full_name||coProfile?.company_name||user.email||"U")[0].toUpperCase()}
                    </div>
                    <span style={{fontSize:"0.78rem",fontWeight:600,color:profileOpen?"#fff":T.text,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {candProfile?.full_name||coProfile?.company_name||user.email?.split("@")[0]}
                    </span>
                    <span style={{fontSize:"0.65rem",color:profileOpen?"rgba(255,255,255,0.7)":T.muted,transition:"transform 0.2s",transform:profileOpen?"rotate(180deg)":"rotate(0)"}}>▼</span>
                  </button>

                  {/* dropdown */}
                  {profileOpen&&(
                    <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",background:T.cardHi,border:`1px solid ${T.border}`,borderRadius:12,minWidth:200,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:999,animation:"scaleIn 0.15s ease",overflow:"hidden"}}>
                      {/* user info */}
                      <div style={{padding:"0.75rem 1rem",borderBottom:`1px solid ${T.border}`,background:T.card}}>
                        <p style={{fontSize:"0.82rem",fontWeight:600,color:T.text,margin:"0 0 2px"}}>{candProfile?.full_name||coProfile?.company_name||"User"}</p>
                        <p style={{fontSize:"0.72rem",color:T.muted,margin:"0 0 4px"}}>{user.email}</p>
                        <span style={{background:T.goldLt,color:T.goldDk,fontSize:"0.65rem",fontWeight:600,padding:"2px 8px",borderRadius:20,border:`1px solid ${T.gold}`}}>
                          {candProfile?"Candidate":coProfile?"Company":"—"}
                        </span>
                      </div>

                      {/* menu items */}
                      {[
                        candProfile ? {label:"Edit Profile",icon:"✏️",action:()=>{ setDName(candProfile.full_name||""); setDBG(candProfile.background||""); setDSkills(candProfile.skills_summary||""); setDLoc(candProfile.preferred_location||""); setDSalary(candProfile.salary_expectation||""); setDBuckets(candProfile.buckets||[]); setProfileOpen(false); setPhase(PH.CAND_PROFILE); }} : null,
                        candProfile ? {label:"My Job Interests",icon:"🎯",action:()=>{ setDBuckets(candProfile.buckets||[]); setProfileOpen(false); setPhase(PH.CAND_BUCKETS); }} : null,
                        coProfile ? {label:"Company Profile",icon:"🏢",action:()=>{ setProfileOpen(false); setPhase(PH.CO_HOME); }} : null,
                        coProfile ? {label:"Post a Role",icon:"➕",action:()=>{ setProfileOpen(false); setPhase(PH.CO_POST); }} : null,
                        {label:"Home",icon:"🏠",action:()=>{ setProfileOpen(false); setPhase(candProfile?PH.HOME:PH.CO_HOME); }},
                        {label:"Sign out",icon:"🚪",action:()=>{ setProfileOpen(false); supabase.auth.signOut(); }, danger:true},
                      ].filter(Boolean).map((item,i)=>(
                        <button key={i} onClick={item.action}
                          style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"0.65rem 1rem",background:"transparent",border:"none",cursor:"pointer",textAlign:"left",borderBottom:i<4?`1px solid ${T.border}`:"none",transition:"background 0.15s"}}
                          onMouseEnter={e=>e.currentTarget.style.background=item.danger?T.goldLt:T.card}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <span style={{fontSize:"0.9rem"}}>{item.icon}</span>
                          <span style={{fontSize:"0.82rem",fontWeight:500,color:item.danger?T.goldDk:T.text}}>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <p style={{textAlign:"center",color:T.muted,fontSize:"0.72rem",margin:"0.4rem 0 0"}}>AI-Powered Career Intelligence · Global</p>
        </header>

        {/* ERROR */}
        {error&&(
          <div style={{background:T.goldLt,border:`1px solid ${T.gold}`,borderRadius:10,padding:"0.75rem 1rem",marginBottom:"1rem",display:"flex",justifyContent:"space-between",alignItems:"center",animation:"scaleIn 0.2s ease"}}>
            <span style={{color:T.goldDk,fontSize:"0.82rem"}}>{error}</span>
            <button onClick={()=>setError("")} style={{background:"none",border:"none",color:T.goldDk,cursor:"pointer",fontSize:"1rem"}}>×</button>
          </div>
        )}

        {/* ═══ AUTH ═══ */}
        {phase===PH.AUTH&&(
          <Card>
            <div style={{textAlign:"center",paddingBottom:"0.5rem"}}>
              <div style={{fontSize:"2rem",marginBottom:"0.5rem"}}>👋</div>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1.2rem",color:T.charcoal,margin:"0 0 0.3rem"}}>Welcome to EasyJob</h2>
              <p style={{color:T.muted,fontSize:"0.83rem",margin:"0 0 1.5rem"}}>AI-powered career intelligence, built for everyone</p>

              <p style={{color:T.text,fontSize:"0.82rem",fontWeight:600,margin:"0 0 0.75rem"}}>I am a...</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem",marginBottom:"1.25rem"}}>
                {[
                  {id:"candidate",icon:"👤",label:"Candidate",desc:"Find jobs, get matched, build your career"},
                  {id:"company",  icon:"🏢",label:"Company",  desc:"Post roles and hire pre-scored talent"},
                ].map(({id,icon,label,desc})=>{
                  const sel=authPersona===id;
                  return (
                    <button key={id} onClick={()=>setAuthPersona(id)}
                      style={{border:`2px solid ${sel?T.charcoal:T.border}`,background:sel?T.charcoal:T.cardHi,borderRadius:12,padding:"1rem 0.75rem",cursor:"pointer",textAlign:"center",transition:"all 0.2s",transform:sel?"scale(1.02)":"scale(1)"}}>
                      <div style={{fontSize:"1.5rem",marginBottom:6}}>{icon}</div>
                      <p style={{fontSize:"0.87rem",fontWeight:600,color:sel?"#fff":T.text,margin:"0 0 3px"}}>{label}</p>
                      <p style={{fontSize:"0.72rem",color:sel?"rgba(255,255,255,0.7)":T.muted,margin:0}}>{desc}</p>
                    </button>
                  );
                })}
              </div>

              <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem"}}>
                {["signin","signup"].map(m=>(
                  <button key={m} onClick={()=>setAuthMode(m)}
                    style={{flex:1,padding:"8px",borderRadius:20,border:`1.5px solid ${authMode===m?T.charcoal:T.border}`,background:authMode===m?T.charcoal:T.bg,color:authMode===m?"#fff":T.muted,fontSize:"0.8rem",fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>
                    {m==="signin"?"Sign in":"Create account"}
                  </button>
                ))}
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:"0.75rem",marginBottom:"0.5rem",textAlign:"left"}}>
                <Input label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email"/>
                <Input label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password"/>
              </div>

              {authMode==="signin"&&(
                <div style={{textAlign:"right",marginBottom:"1rem"}}>
                  <button onClick={forgotPassword}
                    style={{background:"none",border:"none",color:T.gold,fontSize:"0.78rem",cursor:"pointer",fontFamily:"'Inter',sans-serif",textDecoration:"underline",padding:0}}
                    onMouseEnter={e=>e.currentTarget.style.color=T.goldDk}
                    onMouseLeave={e=>e.currentTarget.style.color=T.gold}>
                    Forgot password?
                  </button>
                </div>
              )}

              {loading?<Spinner/>:<Btn full onClick={emailAuth}>
                {authMode==="signin"?`Sign in as ${authPersona==="company"?"Company":"Candidate"} →`:`Create ${authPersona==="company"?"Company":"Candidate"} account →`}
              </Btn>}

              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",margin:"1rem 0"}}>
                <div style={{flex:1,height:1,background:T.border}}/><span style={{color:T.muted,fontSize:"0.75rem"}}>or</span><div style={{flex:1,height:1,background:T.border}}/>
              </div>

              <button onClick={googleAuth} disabled={loading}
                style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:T.cardHi,border:`1px solid ${T.border}`,borderRadius:10,padding:"0.75rem",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:"0.87rem",fontWeight:600,color:T.text,transition:"all 0.2s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=T.card;e.currentTarget.style.borderColor=T.charcoal;}}
                onMouseLeave={e=>{e.currentTarget.style.background=T.cardHi;e.currentTarget.style.borderColor=T.border;}}>
                <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8.9 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.6 39.4 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.8l6.2 5.2C41 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                Continue with Google
              </button>
              <p style={{color:T.muted,fontSize:"0.7rem",marginTop:"1rem"}}>By continuing you agree to EasyJob's Terms of Service</p>
            </div>
          </Card>
        )}

        {/* ═══ ROLE PICKER — Google OAuth users ═══ */}
        {phase===PH.ROLE_PICK&&(
          <Card>
            <div style={{textAlign:"center",paddingBottom:"0.5rem"}}>
              <div style={{fontSize:"2rem",marginBottom:"0.75rem"}}>👋</div>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1.2rem",color:T.charcoal,margin:"0 0 0.3rem"}}>
                One last step
              </h2>
              <p style={{color:T.muted,fontSize:"0.83rem",margin:"0 0 1.5rem"}}>
                Tell us how you'll use EasyJob so we can set up the right experience for you.
              </p>
              <p style={{color:T.text,fontSize:"0.82rem",fontWeight:600,margin:"0 0 0.75rem"}}>I am a...</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem",marginBottom:"1.5rem"}}>
                {[
                  {id:"candidate",icon:"👤",label:"Candidate",desc:"Find jobs, get matched, build your career"},
                  {id:"company",  icon:"🏢",label:"Company",  desc:"Post roles and hire pre-scored talent"},
                ].map(({id,icon,label,desc})=>(
                  <button key={id} onClick={()=>saveRoleAndContinue(id)}
                    style={{border:`2px solid ${T.border}`,background:T.cardHi,borderRadius:12,padding:"1.25rem 0.75rem",cursor:"pointer",textAlign:"center",transition:"all 0.2s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=T.charcoal;e.currentTarget.style.background=T.card;e.currentTarget.style.transform="scale(1.02)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.cardHi;e.currentTarget.style.transform="scale(1)";}}>
                    <div style={{fontSize:"1.75rem",marginBottom:8}}>{icon}</div>
                    <p style={{fontSize:"0.9rem",fontWeight:600,color:T.text,margin:"0 0 4px"}}>{label}</p>
                    <p style={{fontSize:"0.72rem",color:T.muted,margin:0,lineHeight:1.4}}>{desc}</p>
                  </button>
                ))}
              </div>
              {loading&&<Spinner/>}
              <p style={{color:T.muted,fontSize:"0.72rem",marginTop:"0.75rem"}}>
                Signed in as {user?.email}
              </p>
            </div>
          </Card>
        )}

        {/* ═══ CANDIDATE PROFILE ═══ */}
        {phase===PH.CAND_PROFILE&&(
          <Card>
            <SectionHeader step={1} total={2} title="Build your profile"/>
            <Input label="Your Name" value={dName} onChange={setDName} placeholder="e.g. Priya Sharma"/>
            <TA label="Background & Resume *" value={dBG} onChange={setDBG} rows={10}
              placeholder={`Paste your resume or describe your background:\n\n• Work experience (company, role, dates, achievements)\n• Education & certifications\n• Projects and notable wins`}/>
            <TA label="Key Skills & Tools" value={dSkills} onChange={setDSkills} rows={3} optional
              placeholder="e.g. Python, SQL, Tableau, Agile, Stakeholder management"/>
            <Input label="Preferred Location" value={dLoc} onChange={setDLoc} placeholder="e.g. Hyderabad, Bangalore, Remote"/>
            <Input label="Salary Expectation" value={dSalary} onChange={setDSalary} placeholder="e.g. ₹18–22 LPA" optional/>
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:"0.5rem"}}>
              <Btn onClick={()=>{ if(dBG.trim()) setPhase(PH.CAND_BUCKETS); else setError("Add your background to continue."); }} disabled={!dBG.trim()}>
                Choose Job Interests →
              </Btn>
            </div>
          </Card>
        )}

        {/* ═══ CANDIDATE BUCKETS ═══ */}
        {phase===PH.CAND_BUCKETS&&(
          <Card>
            <SectionHeader step={2} total={2} title="What roles interest you?"/>
            <p style={{color:T.muted,fontSize:"0.78rem",margin:"-0.5rem 0 1.25rem"}}>Select all that apply — EasyJob fetches real jobs from these areas for you.</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",marginBottom:"1.25rem"}}>
              {BUCKETS.map((b,i)=>{
                const sel=dBuckets.includes(b.id);
                return (
                  <button key={b.id} onClick={()=>setDBuckets(p=>sel?p.filter(x=>x!==b.id):[...p,b.id])}
                    style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.7rem 0.9rem",borderRadius:10,border:`1.5px solid ${sel?T.charcoal:T.border}`,background:sel?T.charcoal:T.cardHi,cursor:"pointer",textAlign:"left",transition:"all 0.18s",transform:sel?"scale(1.01)":"scale(1)",animation:`fadeUp 0.3s ease ${i*0.03}s both`}}>
                    <span style={{fontSize:"1rem"}}>{b.icon}</span>
                    <span style={{fontSize:"0.8rem",color:sel?"#fff":T.muted,fontWeight:sel?600:400}}>{b.label}</span>
                    {sel&&<span style={{marginLeft:"auto",color:"#fff",fontSize:"0.8rem"}}>✓</span>}
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <Btn variant="secondary" onClick={()=>setPhase(PH.CAND_PROFILE)}>← Back</Btn>
              <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                {loading&&<Spinner/>}
                <Btn onClick={saveCandProfile} disabled={loading||dBuckets.length===0}>{loading?"Saving...":"See My Jobs →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* ═══ CANDIDATE HOME ═══ */}
        {phase===PH.HOME&&(
          <div style={{animation:"fadeIn 0.3s ease"}}>
            {/* header strip */}
            <div style={{background:T.charcoal,borderRadius:14,padding:"1rem 1.25rem",marginBottom:"1.25rem",display:"flex",alignItems:"center",justifyContent:"space-between",animation:"fadeUp 0.3s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
                <div style={{width:38,height:38,borderRadius:"50%",background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:"1rem"}}>
                  {(candProfile?.full_name||user?.email||"U")[0].toUpperCase()}
                </div>
                <div>
                  <div style={{color:"#fff",fontSize:"0.9rem",fontWeight:600}}>{candProfile?.full_name||user?.email}</div>
                  <div style={{color:"rgba(255,255,255,0.55)",fontSize:"0.72rem"}}>
                    {[candProfile?.preferred_location,candProfile?.salary_expectation].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
              <button onClick={editCandProfile}
                style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"5px 12px",color:"rgba(255,255,255,0.8)",fontSize:"0.75rem",cursor:"pointer",transition:"background 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>✏ Edit</button>
            </div>

            {/* stats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.75rem",marginBottom:"1.25rem"}}>
              {[
                {label:"Jobs matched",value:jobs.length||"—",color:T.charcoal},
                {label:"Buckets active",value:candProfile?.buckets?.length||0,color:T.gold},
                {label:"Profile score",value:"100%",color:T.charcoal},
              ].map(({label,value,color},i)=>(
                <SurfaceCard key={label} delay={i*0.05} style={{textAlign:"center"}}>
                  <p style={{fontFamily:"'Syne',sans-serif",fontSize:"1.4rem",fontWeight:800,color,margin:"0 0 4px"}}>{value}</p>
                  <p style={{fontSize:"0.72rem",color:T.muted,margin:0}}>{label}</p>
                </SurfaceCard>
              ))}
            </div>

            {/* job feed */}
            <div style={{marginBottom:"1.25rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
                <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:0}}>Jobs matched for you</h2>
                {jobsLoading&&<Spinner/>}
                {!jobsLoading&&jobs.length>0&&<GoldTag>{jobs.length} found</GoldTag>}
              </div>
              {!jobsLoading&&jobs.length===0&&(
                <SurfaceCard style={{textAlign:"center",padding:"1.5rem"}}>
                  <p style={{color:T.muted,fontSize:"0.84rem",margin:0}}>Your matched jobs will appear here once your profile is complete.</p>
                </SurfaceCard>
              )}
              {jobs.slice(0,10).map((job,i)=>(
                <JobCard key={job.id} job={job} onAnalyse={selectJob} delay={i*0.04}/>
              ))}
            </div>

            <div style={{borderTop:`1px solid ${T.border}`,paddingTop:"1rem",textAlign:"center"}}>
              <p style={{color:T.muted,fontSize:"0.8rem",marginBottom:"0.75rem"}}>Have a specific role in mind?</p>
              <Btn variant="gold" onClick={startManualJD}>Paste a Job Description →</Btn>
            </div>
          </div>
        )}

        {/* ═══ FLOW HEADER ═══ */}
        {inFlow&&(
          <>
            <NavStrip
              label={selJob?`📋 ${selJob.title} · ${selJob.company}`:`✓ ${candProfile?.full_name||user?.email}`}
              onBack={()=>setPhase(PH.HOME)}/>
            <FlowStepper current={phase}/>
          </>
        )}

        {/* ═══ JOB DETAIL ═══ */}
        {phase===PH.JOB_DETAIL&&selJob&&(
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <Card>
              {/* header */}
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"1.25rem",gap:"1rem"}}>
                <div style={{flex:1}}>
                  <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1.1rem",color:T.charcoal,margin:"0 0 4px"}}>{selJob.title}</h2>
                  <p style={{color:T.muted,fontSize:"0.82rem",margin:"0 0 8px"}}>{selJob.company} · {selJob.location}</p>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <span style={{background:T.goldLt,color:T.goldDk,fontSize:"0.7rem",fontWeight:600,padding:"3px 10px",borderRadius:20,border:`1px solid ${T.gold}`}}>{selJob.bucketLabel}</span>
                    {selJob.matchScore&&<span style={{background:T.card,color:T.charcoal,fontSize:"0.7rem",fontWeight:600,padding:"3px 10px",borderRadius:20,border:`1px solid ${T.border}`}}>Match: {selJob.matchScore}%</span>}
                  </div>
                </div>
                <div style={{textAlign:"center",flexShrink:0}}>
                  <div style={{width:56,height:56,borderRadius:"50%",border:`3px solid ${selJob.matchScore>=75?T.charcoal:selJob.matchScore>=55?T.gold:T.muted}`,display:"flex",alignItems:"center",justifyContent:"center",background:T.cardHi}}>
                    <span style={{fontSize:"0.9rem",fontWeight:800,color:selJob.matchScore>=75?T.charcoal:selJob.matchScore>=55?T.gold:T.muted}}>{selJob.matchScore}%</span>
                  </div>
                  <p style={{fontSize:"0.6rem",color:T.muted,margin:"4px 0 0"}}>match</p>
                </div>
              </div>

              {/* full JD */}
              <div style={{marginBottom:"1.25rem"}}>
                <p style={{color:T.muted,fontSize:"0.72rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.5rem"}}>Full Job Description</p>
                <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"1rem",maxHeight:320,overflowY:"auto"}}>
                  <p style={{fontSize:"0.84rem",color:T.text,lineHeight:1.75,margin:0,whiteSpace:"pre-wrap"}}>{selJob.description||"Full description not available for this listing."}</p>
                </div>
              </div>

              {/* apply link */}
              {selJob.url&&(
                <div style={{marginBottom:"1.25rem",padding:"0.75rem 1rem",background:T.card,border:`1px solid ${T.border}`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <p style={{fontSize:"0.82rem",fontWeight:600,color:T.text,margin:"0 0 2px"}}>Apply on company site</p>
                    <p style={{fontSize:"0.72rem",color:T.muted,margin:0}}>Opens in a new tab</p>
                  </div>
                  <a href={selJob.url} target="_blank" rel="noreferrer"
                    style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 14px",color:T.charcoal,fontSize:"0.78rem",fontWeight:600,textDecoration:"none",transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.background=T.charcoal;e.currentTarget.style.color="#fff";}}
                    onMouseLeave={e=>{e.currentTarget.style.background=T.card;e.currentTarget.style.color=T.charcoal;}}>
                    View listing ↗
                  </a>
                </div>
              )}

              {/* tip about full JD */}
              <div style={{padding:"0.875rem 1rem",background:T.goldLt,border:`1px solid ${T.gold}`,borderRadius:10,marginBottom:"0.75rem"}}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:"0.6rem"}}>
                  <span style={{fontSize:"1rem",flexShrink:0}}>💡</span>
                  <div>
                    <p style={{fontSize:"0.78rem",fontWeight:600,color:T.goldDk,margin:"0 0 3px"}}>For the best skill extraction</p>
                    <p style={{fontSize:"0.74rem",color:T.goldDk,margin:0,lineHeight:1.6}}>
                      Open the full listing on the company site, copy the complete JD, and paste it below for highly accurate results.
                    </p>
                  </div>
                </div>
                <button onClick={()=>{
                  setSelJob(null);
                  setJd("");
                  setPhase(PH.JD);
                }} style={{width:"100%",background:T.gold,border:"none",borderRadius:8,padding:"7px 0",color:"#fff",fontSize:"0.78rem",fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif",transition:"all 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=T.goldDk}
                  onMouseLeave={e=>e.currentTarget.style.background=T.gold}>
                  Paste the full JD for better results →
                </button>
              </div>

              {/* what happens next */}
              <div style={{padding:"0.75rem 1rem",background:T.goldLt,border:`1px solid ${T.gold}`,borderRadius:10,marginBottom:"1.25rem"}}>
                <p style={{fontSize:"0.78rem",fontWeight:600,color:T.goldDk,margin:"0 0 4px"}}>What happens when you click Analyse</p>
                <p style={{fontSize:"0.75rem",color:T.goldDk,margin:0,lineHeight:1.6}}>
                  1. AI extracts the key skills from this JD<br/>
                  2. You rate your own proficiency on each skill<br/>
                  3. You get a match score and personalised recommendation<br/>
                  4. Your resume is tailored to this exact role
                </p>
              </div>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <Btn variant="secondary" onClick={()=>setPhase(PH.HOME)}>← Back to Jobs</Btn>
                <Btn variant="gold" onClick={async()=>{
                  setLoad(true); setError("");
                  try {
                    const jdText = (selJob.description||"").trim();
                    const prompt = `You are a senior recruiter. Based on the job title and any available description below, list exactly 7 skills required for this role.

Job Title: ${selJob.title}
Company: ${selJob.company||""}
Description: ${jdText.length>50?jdText:"No description available — infer from job title."}

Rules:
- Always return exactly 7 skills regardless of how much info is available
- Infer from the job title if description is missing or short
- Return ONLY this JSON, no markdown, no explanation:
{"jobTitle":"${selJob.title}","company":"${selJob.company||""}","seniorityLevel":"Mid","skills":["skill1","skill2","skill3","skill4","skill5","skill6","skill7"],"roleType":"business","topPriority":"skill1"}`;
                    const raw = await callClaude([{role:"user",content:prompt}],"Return valid JSON only. No markdown. No explanation.");
                    const cleaned = raw.replace(/```json|```/g,"").trim();
                    const firstBrace = cleaned.indexOf("{");
                    const lastBrace = cleaned.lastIndexOf("}");
                    const jsonStr = firstBrace>=0?cleaned.slice(firstBrace,lastBrace+1):cleaned;
                    const parsed = JSON.parse(jsonStr);
                    const extractedSkills = parsed.skills||[];
                    if (extractedSkills.length>0) {
                      setSkills(extractedSkills);
                      setMeta({jobTitle:parsed.jobTitle||selJob.title,company:parsed.company||selJob.company||"",seniority:parsed.seniorityLevel||"",roleType:parsed.roleType||"",topPriority:parsed.topPriority||""});
                      setJd(jdText||selJob.title);
                    } else {
                      // Fallback — generate generic skills from title words
                      setSkills(["Communication","Problem Solving","Data Analysis","Stakeholder Management","Project Management","Strategic Thinking","Domain Knowledge"]);
                      setMeta({jobTitle:selJob.title,company:selJob.company||"",seniority:"Mid",roleType:"business",topPriority:"Domain Knowledge"});
                      setJd(jdText||selJob.title);
                    }
                  } catch(e) {
                    // Hard fallback — always show something
                    setSkills(["Communication","Problem Solving","Data Analysis","Stakeholder Management","Project Management","Strategic Thinking","Domain Knowledge"]);
                    setMeta({jobTitle:selJob.title,company:selJob.company||"",seniority:"Mid",roleType:"business",topPriority:"Domain Knowledge"});
                    setJd(selJob.description||selJob.title);
                    setError("");
                  }
                  setLoad(false);
                  setPhase(PH.SKILLS);
                }} disabled={loading}>{loading?"Extracting skills...":"Analyse This Role →"}</Btn>
              </div>
            </Card>
          </div>
        )}

        {/* JD */}
        {phase===PH.JD&&(
          <Card>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:"0 0 0.25rem"}}>Paste the Job Description</h2>
            <p style={{color:T.muted,fontSize:"0.75rem",margin:"0 0 0.9rem"}}>Include the full JD for the most accurate skill extraction.</p>
            <TA value={jd} onChange={setJd} rows={11} placeholder="Paste the full job description here..."/>
            <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:"1rem",marginTop:"1rem"}}>
              {loading&&<Spinner/>}
              <Btn onClick={analyzeJD} disabled={loading||!jd.trim()}>{loading?"Analysing...":"Extract Skills →"}</Btn>
            </div>
          </Card>
        )}

        {/* SKILLS */}
        {phase===PH.SKILLS&&(
          <Card>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:"0 0 0.2rem"}}>Rate Your Skills</h2>
            <p style={{color:T.muted,fontSize:"0.75rem",margin:"0 0 0.9rem"}}>
              {meta.jobTitle?`${meta.jobTitle} at ${meta.company}`:selJob?`${selJob.title} at ${selJob.company}`:"Be honest — this drives your match score."}
            </p>
            {skills.length===0&&selJob&&(
              <SurfaceCard style={{textAlign:"center",marginBottom:"1rem"}}>
                <p style={{color:T.muted,fontSize:"0.82rem",margin:"0 0 0.75rem"}}>
                  {loading?"Extracting skills from this job description...":"Ready to extract skills — click below to continue."}
                </p>
                {loading?<Spinner/>:<Btn small onClick={async()=>{
                  setLoad(true); setError("");
                  try {
                    const jdText = selJob.description||selJob.title;
                    const prompt = `Extract 7-9 key skills from this job: ${selJob.title} at ${selJob.company}. JD: ${jdText}. Respond ONLY in JSON: {"jobTitle":"","company":"","seniorityLevel":"","skills":[],"roleType":"","topPriority":""}`;
                    const raw = await callClaude([{role:"user",content:prompt}],`You are a talent specialist. Extract skills from job descriptions. Always return valid JSON even if the JD is short — infer from the job title if needed.`);
                    const cleaned = raw.replace(/```json|```/g,"").trim();
                    const parsed = JSON.parse(cleaned);
                    if (parsed.skills&&parsed.skills.length>0) {
                      setSkills(parsed.skills);
                      setMeta({jobTitle:parsed.jobTitle||selJob.title,company:parsed.company||selJob.company,seniority:parsed.seniorityLevel||"",roleType:parsed.roleType||"",topPriority:parsed.topPriority||""});
                      setJd(jdText);
                    } else {
                      setError("Skills could not be extracted. Try pasting the full JD using the manual option below.");
                    }
                  } catch(e) {
                    setError("Skills could not be extracted automatically. Use the manual JD option below.");
                  }
                  setLoad(false);
                }}>Extract Skills →</Btn>}
              </SurfaceCard>
            )}
            {skills.length===0&&selJob&&!loading&&(
              <div style={{textAlign:"center",marginBottom:"0.75rem"}}>
                <button onClick={()=>{setSelJob(null);setPhase(PH.JD);}} style={{background:"none",border:"none",color:T.gold,fontSize:"0.78rem",cursor:"pointer",textDecoration:"underline",fontFamily:"'Inter',sans-serif"}}>
                  Paste the full JD manually instead →
                </button>
              </div>
            )}
            {meta.topPriority&&(
              <div style={{padding:"0.5rem 0.85rem",background:T.goldLt,border:`1px solid ${T.gold}`,borderRadius:8,marginBottom:"0.9rem",fontSize:"0.75rem",color:T.goldDk}}>
                ★ Top priority for this role: {meta.topPriority}
              </div>
            )}
            {skills.map((s,i)=><SkillRow key={s} skill={s} rating={ratings[s]||0} onChange={v=>setRatings(r=>({...r,[s]:v}))} isTop={s===meta.topPriority}/>)}
            {skills.length>0&&(
              <div style={{display:"flex",justifyContent:"space-between",marginTop:"1rem"}}>
                <Btn variant="secondary" onClick={()=>{ setError(""); setPhase(selJob?PH.JOB_DETAIL:PH.HOME); }}>← Back to Job</Btn>
                <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                  {loading&&<Spinner/>}
                  <Btn onClick={getRec} disabled={loading||skills.some(s=>!ratings[s])}>{loading?"Scoring...":"See My Match Score →"}</Btn>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* RECOMMENDATION */}
        {phase===PH.REC&&(
          <Card>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:"0 0 0.9rem"}}>Your Match Score</h2>
            <div style={{background:T.card,borderRadius:10,padding:"1rem",marginBottom:"1rem",border:`1px solid ${T.border}`}}><MD text={rec}/></div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <Btn variant="secondary" onClick={()=>setPhase(PH.SKILLS)}>← Adjust</Btn>
              <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                {loading&&<Spinner/>}
                <Btn onClick={tailorResume} disabled={loading}>{loading?"Generating...":"Tailor My Resume →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* RESUME */}
        {phase===PH.RESUME&&(
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.9rem"}}>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:0}}>Tailored Resume</h2>
              <button onClick={()=>navigator.clipboard.writeText(resume)}
                style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:7,padding:"3px 9px",color:T.muted,fontSize:"0.7rem",cursor:"pointer",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=T.charcoal;e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.background=T.card;e.currentTarget.style.color=T.muted;}}>
                📋 Copy
              </button>
            </div>
            <PreBox text={resume}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:"1rem"}}>
              <Btn variant="secondary" onClick={()=>setPhase(PH.REC)}>← Back</Btn>
              <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                {loading&&<Spinner/>}
                <Btn onClick={runATS} disabled={loading}>{loading?"Reviewing...":"Run ATS Review →"}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* ATS */}
        {phase===PH.ATS&&(
          <>
            {atsScore!==null&&(
              <SurfaceCard delay={0} style={{display:"flex",alignItems:"center",gap:"1.5rem",marginBottom:"0.9rem"}}>
                <ScoreDial score={atsScore}/>
                <div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",fontWeight:800,color:T.charcoal}}>
                    ATS Score: {atsScore>=75?"Strong":atsScore>=55?"Good foundation":"Build this before applying"}
                  </div>
                  <div style={{color:T.muted,fontSize:"0.76rem",marginTop:"0.25rem"}}>
                    {atsScore>=75?"Well-optimised for most ATS systems.":atsScore>=55?"A few keyword additions will lift this significantly.":"The improvements below will make a real difference."}
                  </div>
                </div>
              </SurfaceCard>
            )}
            <Card>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:"0 0 0.9rem"}}>ATS & Hiring Manager Review</h2>
              <div style={{background:T.card,borderRadius:10,padding:"1rem",border:`1px solid ${T.border}`}}><MD text={atsReview}/></div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:"1rem"}}>
                <Btn variant="secondary" onClick={()=>setPhase(PH.RESUME)}>← Resume</Btn>
                <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                  {loading&&<Spinner/>}
                  <Btn variant="gold" onClick={genCL} disabled={loading}>{loading?"Writing...":"Generate Cover Letter →"}</Btn>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* COVER LETTER */}
        {phase===PH.CL&&(
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.9rem"}}>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:0}}>Cover Letter</h2>
              <button onClick={()=>navigator.clipboard.writeText(cl)}
                style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:7,padding:"3px 9px",color:T.muted,fontSize:"0.7rem",cursor:"pointer",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=T.charcoal;e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.background=T.card;e.currentTarget.style.color=T.muted;}}>
                📋 Copy
              </button>
            </div>
            <PreBox text={cl}/>
            <div style={{marginTop:"0.9rem",padding:"0.75rem 1rem",background:T.goldLt,border:`1px solid ${T.gold}`,borderRadius:9}}>
              <p style={{color:T.goldDk,fontSize:"0.78rem",fontWeight:600,margin:"0 0 0.15rem"}}>✓ Application package complete!</p>
              <p style={{color:T.muted,fontSize:"0.73rem",margin:0}}>Resume and cover letter tailored for {meta.jobTitle} at {meta.company}.</p>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:"0.9rem"}}>
              <Btn variant="secondary" onClick={()=>setPhase(PH.ATS)}>← ATS Review</Btn>
              <Btn onClick={()=>setPhase(PH.HOME)}>Back to Home →</Btn>
            </div>
          </Card>
        )}

        {/* ═══ COMPANY PROFILE ═══ */}
        {phase===PH.CO_PROFILE&&(
          <Card>
            <SectionHeader step={1} title="Set up your company profile"/>
            <Input label="Company Name *" value={coName} onChange={setCoName} placeholder="e.g. Zepto, McKinsey India"/>
            <Select label="Industry *" value={coIndustry} onChange={setCoIndustry} options={INDUSTRIES} placeholder="Select your industry"/>
            <Select label="Company Size" value={coSize} onChange={setCoSize} options={CO_SIZES} placeholder="Select headcount"/>
            <Input label="Company Website" value={coWebsite} onChange={setCoWebsite} placeholder="https://yourcompany.com" optional/>
            <Input label="Your Name (Hiring Contact)" value={coContact} onChange={setCoContact} placeholder="e.g. Rahul Sharma" optional/>
            <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:"1rem"}}>
              {loading&&<Spinner/>}
              <Btn onClick={saveCoProfile} disabled={loading||!coName.trim()||!coIndustry}>{loading?"Saving...":"Go to Dashboard →"}</Btn>
            </div>
          </Card>
        )}

        {/* ═══ COMPANY HOME ═══ */}
        {phase===PH.CO_HOME&&(
          <div style={{animation:"fadeIn 0.3s ease"}}>
            {/* header */}
            <div style={{background:T.charcoal,borderRadius:14,padding:"1rem 1.25rem",marginBottom:"1.25rem",display:"flex",alignItems:"center",justifyContent:"space-between",animation:"fadeUp 0.3s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
                <div style={{width:38,height:38,borderRadius:8,background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:"1rem"}}>
                  {(coProfile?.company_name||"C")[0].toUpperCase()}
                </div>
                <div>
                  <div style={{color:"#fff",fontSize:"0.9rem",fontWeight:600}}>{coProfile?.company_name}</div>
                  <div style={{color:"rgba(255,255,255,0.55)",fontSize:"0.72rem"}}>{coProfile?.industry} · {coProfile?.company_size}</div>
                </div>
              </div>
              <Btn small variant="gold" onClick={()=>setPhase(PH.CO_POST)}>+ Post a Role</Btn>
            </div>

            {/* stats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.75rem",marginBottom:"1.25rem"}}>
              {[
                {label:"Roles posted",value:coJobs.length,color:T.charcoal},
                {label:"Applications",value:candidates.length,color:T.gold},
                {label:"Avg score",value:candidates.length?Math.round(candidates.reduce((a,c)=>a+(c.match_score||0),0)/candidates.length)+"%":"—",color:T.charcoal},
              ].map(({label,value,color},i)=>(
                <SurfaceCard key={label} delay={i*0.05} style={{textAlign:"center"}}>
                  <p style={{fontFamily:"'Syne',sans-serif",fontSize:"1.4rem",fontWeight:800,color,margin:"0 0 4px"}}>{value}</p>
                  <p style={{fontSize:"0.72rem",color:T.muted,margin:0}}>{label}</p>
                </SurfaceCard>
              ))}
            </div>

            {/* active roles */}
            <Card delay={0.1} style={{marginBottom:"1rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
                <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:0}}>Active Roles</h2>
                <Btn small variant="secondary" onClick={()=>loadCoJobs(user.id)}>↻ Refresh</Btn>
              </div>
              {coJobs.length===0?(
                <div style={{textAlign:"center",padding:"1.5rem",color:T.muted,fontSize:"0.84rem"}}>Post your first role to start receiving pre-scored candidates.</div>
              ):coJobs.map((job,i)=>(
                <div key={job.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.8rem 1rem",border:`1px solid ${T.border}`,borderRadius:10,marginBottom:"0.5rem",background:T.card,transition:"all 0.2s",animation:`slideRight 0.3s ease ${i*0.05}s both`}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.charcoal;e.currentTarget.style.transform="translateX(3px)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="translateX(0)";}}>
                  <div>
                    <p style={{fontSize:"0.87rem",fontWeight:600,color:T.text,margin:"0 0 3px"}}>{job.title}</p>
                    <p style={{fontSize:"0.73rem",color:T.muted,margin:0}}>{job.location||"Location not set"} · {job.job_type||"Full-time"}</p>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                    <DarkTag>{job.status}</DarkTag>
                    <Btn small onClick={()=>{ setSelCoJob(job); setPhase(PH.CO_PIPELINE); }}>Pipeline →</Btn>
                  </div>
                </div>
              ))}
            </Card>

            {/* pipeline preview */}
            <Card delay={0.15}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
                <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:0}}>Top Candidates</h2>
                <div style={{display:"flex",gap:"0.5rem"}}>
                  <Btn small variant="secondary" onClick={loadCandidates}>↻</Btn>
                  <Btn small variant="gold" onClick={()=>setPhase(PH.CO_PIPELINE)}>View All →</Btn>
                </div>
              </div>
              {candidates.length===0?(
                <div style={{textAlign:"center",padding:"1rem",color:T.muted,fontSize:"0.84rem"}}>Candidate assessments appear here as seekers complete applications.</div>
              ):[...candidates].sort((a,b)=>(b.match_score||0)-(a.match_score||0)).slice(0,3).map((c,i)=>(
                <CandidateRow key={c.id} c={c} rank={i} delay={i*0.06}
                  onClick={()=>{ setSelCand(c); setPhase(PH.CO_CANDIDATE); }}/>
              ))}
              {/* AI insight strip */}
              {candidates.length>0&&(
                <div style={{marginTop:"0.75rem",padding:"0.75rem 1rem",background:T.goldLt,borderLeft:`3px solid ${T.gold}`,borderRadius:"0 8px 8px 0"}}>
                  <p style={{fontSize:"0.72rem",color:T.gold,margin:"0 0 3px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>AI insight</p>
                  <p style={{fontSize:"0.78rem",color:T.goldDk,margin:0,lineHeight:1.6}}>
                    {candidates.filter(c=>(c.match_score||0)>=75).length} candidates score above 75%. Consider adding a skill test to differentiate the top tier.
                  </p>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ═══ POST A JOB ═══ */}
        {phase===PH.CO_POST&&(
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <NavStrip label="Company Dashboard" onBack={()=>setPhase(PH.CO_HOME)}/>
            <Card>
              <SectionHeader step={1} title="Post a new role"/>
              <Input label="Job Title *" value={jpTitle} onChange={setJpTitle} placeholder="e.g. Senior Data Analyst"/>
              <TA label="Job Description *" value={jpJD} onChange={setJpJD} rows={10}
                placeholder="Paste the full job description including responsibilities, requirements, and what you offer..."/>
              <Input label="Location" value={jpLoc} onChange={setJpLoc} placeholder="e.g. Hyderabad, Remote, Hybrid"/>
              <Select label="Job Type" value={jpType} onChange={setJpType} options={JOB_TYPES} placeholder="Select job type"/>
              <Input label="Salary Range" value={jpSalary} onChange={setJpSalary} placeholder="e.g. ₹18–25 LPA" optional/>
              <Input label="Application Deadline" value={jpDeadline} onChange={setJpDeadline} placeholder="" type="date" optional/>
              <div style={{padding:"0.75rem 1rem",background:T.card,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:"1rem",fontSize:"0.78rem",color:T.muted}}>
                Skill tests for this role can be added from the pipeline view after publishing.
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <Btn variant="secondary" onClick={()=>setPhase(PH.CO_HOME)}>← Back</Btn>
                <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                  {loading&&<Spinner/>}
                  <Btn onClick={postJob} disabled={loading||!jpTitle.trim()||!jpJD.trim()}>{loading?"Publishing...":"Publish Role →"}</Btn>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ═══ PIPELINE ═══ */}
        {phase===PH.CO_PIPELINE&&(
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <NavStrip label="Company Dashboard" onBack={()=>setPhase(PH.CO_HOME)}/>
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
                <div>
                  <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",color:T.charcoal,margin:"0 0 0.2rem"}}>
                    {selCoJob?`Pipeline — ${selCoJob.title}`:"All Candidates"}
                  </h2>
                  <p style={{color:T.muted,fontSize:"0.75rem",margin:0}}>{candidates.length} assessed · sorted by score</p>
                </div>
                <Btn small variant="secondary" onClick={loadCandidates}>↻ Refresh</Btn>
              </div>
              <div style={{padding:"0.6rem 0.9rem",background:T.goldLt,border:`1px solid ${T.gold}`,borderRadius:8,marginBottom:"1rem",fontSize:"0.74rem",color:T.goldDk}}>
                Every outcome you log improves EasyJob's prediction accuracy for your next hire.
              </div>
              {candidates.length===0?(
                <div style={{textAlign:"center",padding:"2rem",color:T.muted,fontSize:"0.84rem"}}>
                  Candidate assessments appear here as seekers complete their skill ratings.
                </div>
              ):[...candidates].sort((a,b)=>(b.match_score||0)-(a.match_score||0)).map((c,i)=>(
                <CandidateRow key={c.id} c={c} rank={i} delay={i*0.04}
                  onClick={()=>{ setSelCand(c); setPhase(PH.CO_CANDIDATE); }}/>
              ))}
            </Card>
          </div>
        )}

        {/* ═══ CANDIDATE DETAIL ═══ */}
        {phase===PH.CO_CANDIDATE&&selCand&&(
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <NavStrip label="Pipeline" onBack={()=>setPhase(PH.CO_PIPELINE)}/>
            <Card>
              <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1.25rem"}}>
                <div style={{width:50,height:50,borderRadius:"50%",background:T.card,display:"flex",alignItems:"center",justifyContent:"center",color:T.charcoal,fontWeight:700,fontSize:"1.1rem",border:`2px solid ${T.charcoal}`}}>
                  {(selCand.users?.full_name||"?")[0].toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <p style={{fontSize:"0.95rem",fontWeight:600,color:T.text,margin:"0 0 2px"}}>{selCand.users?.full_name||selCand.users?.email}</p>
                  <p style={{fontSize:"0.75rem",color:T.muted,margin:0}}>Applied for {selCand.role_target}</p>
                </div>
                <div style={{textAlign:"right"}}>
                  <p style={{fontFamily:"'Syne',sans-serif",fontSize:"1.8rem",fontWeight:800,color:selCand.match_score>=75?T.charcoal:T.gold,margin:0}}>{selCand.match_score||"—"}</p>
                  <p style={{fontSize:"0.62rem",color:T.muted,margin:0}}>match score</p>
                </div>
              </div>

              <div style={{marginBottom:"1.1rem"}}>
                <p style={{color:T.muted,fontSize:"0.7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.5rem"}}>Self-Assessed Skills</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
                  {Object.entries(selCand.skills||{}).map(([skill,rating])=>(
                    <span key={skill} style={{padding:"3px 10px",borderRadius:20,fontSize:"0.73rem",background:T.card,color:T.text,border:`1px solid ${T.border}`}}>{skill}: {rating}/5</span>
                  ))}
                </div>
              </div>

              <div>
                <p style={{color:T.muted,fontSize:"0.7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.5rem"}}>Log Outcome</p>
                <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                  {[
                    {label:"Move to Interview",icon:"📞",val:"interview"},
                    {label:"Shortlist",icon:"⭐",val:"shortlisted"},
                    {label:"Offer Extended",icon:"🎉",val:"offer"},
                    {label:"Another Direction",icon:"→",val:"rejected"},
                    {label:"No Response",icon:"👻",val:"ghosted"},
                  ].map(({label,icon,val})=>(
                    <button key={val} onClick={()=>logOutcome(val)}
                      style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:T.cardHi,color:T.text,fontSize:"0.76rem",cursor:"pointer",fontWeight:500,transition:"all 0.15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.background=T.charcoal;e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor=T.charcoal;}}
                      onMouseLeave={e=>{e.currentTarget.style.background=T.cardHi;e.currentTarget.style.color=T.text;e.currentTarget.style.borderColor=T.border;}}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
                <p style={{color:T.muted,fontSize:"0.7rem",margin:"0.6rem 0 0"}}>Logging outcomes sends AI feedback to the candidate and improves EasyJob's predictions.</p>
              </div>
            </Card>
          </div>
        )}

        <div ref={bottomRef}/>
        <p style={{textAlign:"center",marginTop:"1.5rem",color:T.border,fontSize:"0.62rem",letterSpacing:"0.08em",textTransform:"uppercase"}}>EasyJob · Beta · Powered by Claude AI</p>
      </div>
    </div>
  );
}