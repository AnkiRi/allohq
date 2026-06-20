"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Type,
  Monitor,
  Smartphone,
  Moon,
  Sun,
  Wand2,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Loader2,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  Hash,
  AtSign,
  Ban,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Motion variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tone = "professional" | "casual" | "urgent" | "friendly";

interface SubjectScoreBreakdown {
  length: { score: number; label: string; detail: string };
  personalization: { score: number; label: string; detail: string };
  powerWords: { score: number; label: string; detail: string };
  spamCheck: { score: number; label: string; detail: string };
}

// ---------------------------------------------------------------------------
// Subject Line Scoring (client-side heuristic)
// ---------------------------------------------------------------------------

const POWER_WORDS = [
  "free", "new", "exclusive", "limited", "save", "discover", "unlock",
  "proven", "secret", "instant", "now", "today", "last chance", "hurry",
  "don't miss", "sale", "deal", "offer", "gift", "bonus", "guaranteed",
  "introducing", "finally", "just for you", "special", "urgent",
];

const SPAM_WORDS = [
  "buy now", "click here", "congratulations", "winner", "act now",
  "no obligation", "100%", "free trial", "as seen on", "order now",
  "risk free", "satisfaction guaranteed", "all caps", "!!!",
  "$$", "make money", "earn extra", "double your",
];

function scoreSubjectLine(subject: string): { total: number; breakdown: SubjectScoreBreakdown; suggestions: string[] } {
  const suggestions: string[] = [];
  const trimmed = subject.trim();
  if (!trimmed) {
    return {
      total: 0,
      breakdown: {
        length: { score: 0, label: "Length", detail: "Enter a subject line" },
        personalization: { score: 0, label: "Personalization", detail: "No text to analyze" },
        powerWords: { score: 0, label: "Power Words", detail: "No text to analyze" },
        spamCheck: { score: 0, label: "Spam Check", detail: "No text to analyze" },
      },
      suggestions: ["Enter a subject line to get started"],
    };
  }

  const lower = trimmed.toLowerCase();

  // Length score (ideal: 30-60 chars)
  const len = trimmed.length;
  let lengthScore: number;
  let lengthDetail: string;
  if (len >= 30 && len <= 60) {
    lengthScore = 25;
    lengthDetail = `${len} chars - optimal length`;
  } else if (len >= 20 && len <= 80) {
    lengthScore = 18;
    lengthDetail = `${len} chars - acceptable`;
    if (len < 30) suggestions.push("Add a few more words for better engagement");
    if (len > 60) suggestions.push("Consider shortening - mobile devices truncate after ~60 chars");
  } else if (len < 20) {
    lengthScore = 10;
    lengthDetail = `${len} chars - too short`;
    suggestions.push("Subject lines under 20 characters feel incomplete");
  } else {
    lengthScore = 8;
    lengthDetail = `${len} chars - too long, will be truncated`;
    suggestions.push("Subject will be cut off on most email clients");
  }

  // Personalization score
  let personalizationScore = 0;
  let personalizationDetail = "No personalization tokens found";
  const hasFirstName = /\{first_?name\}|\{\{first_?name\}\}/i.test(trimmed);
  const hasYou = /\byou\b|\byour\b/i.test(trimmed);
  const hasEmoji = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(trimmed);
  if (hasFirstName) { personalizationScore += 15; personalizationDetail = "Uses first name token"; }
  else if (hasYou) { personalizationScore += 10; personalizationDetail = "Uses 'you/your' language"; }
  else { suggestions.push("Add {first_name} or 'you/your' for personalization"); }
  if (hasEmoji) { personalizationScore += 5; personalizationDetail += " + emoji"; }
  else { suggestions.push("Consider adding an emoji for higher open rates"); }
  personalizationScore = Math.min(personalizationScore, 25);

  // Power words score
  const foundPower = POWER_WORDS.filter((w) => lower.includes(w));
  let powerScore: number;
  let powerDetail: string;
  if (foundPower.length >= 2) {
    powerScore = 25;
    powerDetail = `Contains: ${foundPower.slice(0, 3).join(", ")}`;
  } else if (foundPower.length === 1) {
    powerScore = 18;
    powerDetail = `Contains: ${foundPower[0]}`;
    suggestions.push("Add another power word like 'exclusive', 'limited', or 'discover'");
  } else {
    powerScore = 5;
    powerDetail = "No power words detected";
    suggestions.push("Include power words like 'free', 'new', 'exclusive', or 'save'");
  }

  // Spam check score (inverse - fewer spam words = higher score)
  const foundSpam = SPAM_WORDS.filter((w) => lower.includes(w));
  const allCaps = trimmed === trimmed.toUpperCase() && trimmed.length > 5;
  const excessivePunctuation = (trimmed.match(/[!?]{2,}/g) || []).length > 0;

  let spamScore: number;
  let spamDetail: string;
  if (foundSpam.length === 0 && !allCaps && !excessivePunctuation) {
    spamScore = 25;
    spamDetail = "Clean - no spam triggers found";
  } else {
    const penalties = foundSpam.length * 5 + (allCaps ? 10 : 0) + (excessivePunctuation ? 5 : 0);
    spamScore = Math.max(0, 25 - penalties);
    const issues: string[] = [];
    if (foundSpam.length > 0) issues.push(`spam words: ${foundSpam.join(", ")}`);
    if (allCaps) issues.push("ALL CAPS");
    if (excessivePunctuation) issues.push("excessive punctuation");
    spamDetail = `Issues: ${issues.join(", ")}`;
    if (allCaps) suggestions.push("Avoid ALL CAPS - it triggers spam filters");
    if (foundSpam.length > 0) suggestions.push(`Remove spam triggers: ${foundSpam.join(", ")}`);
  }

  return {
    total: lengthScore + personalizationScore + powerScore + spamScore,
    breakdown: {
      length: { score: lengthScore, label: "Length", detail: lengthDetail },
      personalization: { score: personalizationScore, label: "Personalization", detail: personalizationDetail },
      powerWords: { score: powerScore, label: "Power Words", detail: powerDetail },
      spamCheck: { score: spamScore, label: "Spam Check", detail: spamDetail },
    },
    suggestions,
  };
}

// ---------------------------------------------------------------------------
// Score gauge component
// ---------------------------------------------------------------------------

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#6B7A2F" : score >= 60 ? "#B8963E" : score >= 40 ? "#c4704a" : "#dc2626";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Work";
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
          <motion.circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 213.6} 213.6`}
            initial={{ strokeDasharray: "0 213.6" }}
            animate={{ strokeDasharray: `${(score / 100) * 213.6} 213.6` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[18px] font-bold font-mono" style={{ color }}>{score}</span>
        </div>
      </div>
      <div>
        <p className="text-[14px] font-semibold text-foreground font-sans">{label}</p>
        <p className="text-[11px] text-muted-foreground font-sans">out of 100</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breakdown bar component
// ---------------------------------------------------------------------------

function BreakdownBar({ label, score, maxScore, detail, icon: Icon }: {
  label: string;
  score: number;
  maxScore: number;
  detail: string;
  icon: React.ElementType;
}) {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const color = pct >= 80 ? "#6B7A2F" : pct >= 60 ? "#B8963E" : "#c4704a";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[12px] font-sans text-foreground">{label}</span>
        </div>
        <span className="text-[11px] font-mono font-semibold" style={{ color }}>
          {score}/{maxScore}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-black/[0.04] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab button component
// ---------------------------------------------------------------------------

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-sans transition-all ${
        active
          ? "bg-foreground text-background font-semibold"
          : "bg-white/20 border border-white/20 text-muted-foreground hover:bg-white/30 hover:text-foreground"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card wrapper
// ---------------------------------------------------------------------------

function StudioCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-black/5 dark:border-[rgba(200,180,150,0.12)] p-6 bg-white/60 dark:bg-[rgba(40,36,30,0.7)] ${className}`}
      style={{ backdropFilter: "blur(20px)" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ icon: Icon, title, subtitle }: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(184,150,62,0.1)" }}>
        <Icon className="w-4 h-4" style={{ color: "#B8963E" }} />
      </div>
      <div>
        <h2
          className="text-[13px] font-serif uppercase tracking-[0.08em] font-bold text-foreground"
        >
          {title}
        </h2>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type ActiveTab = "subject" | "preview" | "copy" | "brand";

export default function CreativeStudioPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("subject");

  return (
    <motion.div
      className="space-y-6 w-full"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1
          className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-bold text-foreground font-serif"
        >
          CREATIVE STUDIO
        </h1>
        <p className="text-[13px] text-muted-foreground font-sans mt-1">
          AI-powered tools to craft, score, and refine your marketing content
        </p>
      </motion.div>

      {/* Tab Navigation */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-2">
        <TabButton active={activeTab === "subject"} onClick={() => setActiveTab("subject")} icon={Type} label="Subject Scorer" />
        <TabButton active={activeTab === "preview"} onClick={() => setActiveTab("preview")} icon={Monitor} label="Email Preview" />
        <TabButton active={activeTab === "copy"} onClick={() => setActiveTab("copy")} icon={Wand2} label="Copy Assistant" />
        <TabButton active={activeTab === "brand"} onClick={() => setActiveTab("brand")} icon={ShieldCheck} label="Brand Voice Check" />
      </motion.div>

      {/* Tab Content */}
      {activeTab === "subject" && <SubjectLineScorer />}
      {activeTab === "preview" && <EmailPreviewGenerator />}
      {activeTab === "copy" && <CopyAssistant />}
      {activeTab === "brand" && <BrandVoiceCheck />}
    </motion.div>
  );
}

// ===========================================================================
// 1. Subject Line Scorer
// ===========================================================================

function SubjectLineScorer() {
  const [subject, setSubject] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [generatingAlts, setGeneratingAlts] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const result = useMemo(() => scoreSubjectLine(subject), [subject]);

  const handleGenerateAlternatives = useCallback(() => {
    setGeneratingAlts(true);
    // Simulate AI generation with heuristic alternatives
    setTimeout(() => {
      const base = subject.trim();
      const alts: string[] = [];
      if (base) {
        // Generate variations
        alts.push(`{first_name}, ${base.charAt(0).toLowerCase()}${base.slice(1)}`);
        const withEmoji = `${base} ✨`;
        alts.push(withEmoji);
        if (base.length > 40) {
          alts.push(base.slice(0, 40).trim() + "...");
        }
        alts.push(`Don't miss: ${base}`);
        alts.push(`Exclusive: ${base}`);
      } else {
        alts.push("Your exclusive offer awaits, {first_name}");
        alts.push("New arrivals just for you ✨");
        alts.push("Don't miss out - limited time only");
        alts.push("{first_name}, here's something special");
      }
      setAlternatives(alts.slice(0, 5));
      setGeneratingAlts(false);
    }, 1200);
  }, [subject]);

  const copyToClipboard = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-5 gap-6"
    >
      {/* Left: Input & suggestions */}
      <div className="lg:col-span-3 space-y-6">
        <StudioCard>
          <SectionHeader icon={Type} title="Subject Line Scorer" subtitle="Analyze and optimize your email subject lines" />

          <div className="space-y-4">
            <div>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter your subject line..."
                className="w-full px-4 py-3 bg-white/30 border border-border rounded-xl text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors font-sans"
                maxLength={200}
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground font-mono">{subject.length} characters</span>
                <span className={`text-[10px] font-sans ${subject.length > 60 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {subject.length > 60 ? "May be truncated on mobile" : "Ideal: 30-60 characters"}
                </span>
              </div>
            </div>

            {/* Suggestions */}
            {result.suggestions.length > 0 && subject.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[11px] font-serif uppercase tracking-wider text-muted-foreground font-bold">
                  Suggestions
                </h3>
                <div className="space-y-1.5">
                  {result.suggestions.map((sug, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] text-foreground/80">
                      <ArrowRight className="w-3 h-3 text-[#B8963E] mt-0.5 flex-shrink-0" />
                      <span>{sug}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </StudioCard>

        {/* Alternatives */}
        <StudioCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-serif uppercase tracking-wider text-muted-foreground font-bold">
              AI Alternatives
            </h3>
            <button
              onClick={handleGenerateAlternatives}
              disabled={generatingAlts}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-[11px] font-sans font-semibold hover:opacity-90 transition-all disabled:opacity-50"
            >
              {generatingAlts ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {generatingAlts ? "Generating..." : "Generate Alternatives"}
            </button>
          </div>

          {alternatives.length > 0 ? (
            <div className="space-y-2">
              {alternatives.map((alt, i) => {
                const altScore = scoreSubjectLine(alt).total;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/30 border border-black/[0.04] group hover:bg-white/50 transition-colors"
                  >
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                        altScore >= 70 ? "bg-[#6B7A2F]/10 text-[#6B7A2F]" : altScore >= 50 ? "bg-[#B8963E]/10 text-[#B8963E]" : "bg-[#c4704a]/10 text-[#c4704a]"
                      }`}
                    >
                      {altScore}
                    </span>
                    <span className="flex-1 text-[13px] font-sans text-foreground">{alt}</span>
                    <button
                      onClick={() => copyToClipboard(alt, i)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/40 text-muted-foreground hover:text-foreground transition-all"
                      title="Copy"
                    >
                      {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-[#6B7A2F]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setSubject(alt)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] font-sans text-[var(--color-accent)] hover:opacity-80 transition-all"
                    >
                      Use
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground text-center py-6">
              Click &quot;Generate Alternatives&quot; to get AI-suggested subject lines
            </p>
          )}
        </StudioCard>
      </div>

      {/* Right: Score & breakdown */}
      <div className="lg:col-span-2 space-y-6">
        <StudioCard>
          <h3 className="text-[11px] font-serif uppercase tracking-wider text-muted-foreground font-bold mb-4">
            Score
          </h3>
          <ScoreGauge score={result.total} />
        </StudioCard>

        <StudioCard>
          <h3 className="text-[11px] font-serif uppercase tracking-wider text-muted-foreground font-bold mb-4">
            Breakdown
          </h3>
          <div className="space-y-4">
            <BreakdownBar icon={Hash} label={result.breakdown.length.label} score={result.breakdown.length.score} maxScore={25} detail={result.breakdown.length.detail} />
            <BreakdownBar icon={AtSign} label={result.breakdown.personalization.label} score={result.breakdown.personalization.score} maxScore={25} detail={result.breakdown.personalization.detail} />
            <BreakdownBar icon={Zap} label={result.breakdown.powerWords.label} score={result.breakdown.powerWords.score} maxScore={25} detail={result.breakdown.powerWords.detail} />
            <BreakdownBar icon={Ban} label={result.breakdown.spamCheck.label} score={result.breakdown.spamCheck.score} maxScore={25} detail={result.breakdown.spamCheck.detail} />
          </div>
        </StudioCard>
      </div>
    </div>
  );
}

// ===========================================================================
// 2. Email Preview Generator
// ===========================================================================

function EmailPreviewGenerator() {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [darkMode, setDarkMode] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { data: templates, isLoading } = trpc.templates.list.useQuery(undefined) as {
    data: { id: string; name: string; subject: string; category: string }[] | undefined;
    isLoading: boolean;
  };

  const { data: templateDetail } = (trpc.templates as any).getById.useQuery(
    { id: selectedTemplate },
    { enabled: !!selectedTemplate }
  ) as { data: { id: string; name: string; subject: string; htmlContent?: string; textContent?: string } | undefined };

  const selectedName = templates?.find((t) => t.id === selectedTemplate)?.name ?? "";

  return (
    <div
      className="space-y-6"
    >
      <StudioCard>
        <SectionHeader icon={Monitor} title="Email Preview" subtitle="Preview templates across devices and themes" />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Template selector */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-white/30 border border-border rounded-xl text-[13px] font-sans text-foreground hover:bg-white/40 transition-colors"
            >
              <span className={selectedTemplate ? "text-foreground" : "text-muted-foreground/50"}>
                {selectedTemplate ? selectedName : "Select a template..."}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto py-1">
                {isLoading ? (
                  <div className="px-4 py-3 text-[12px] text-muted-foreground">Loading templates...</div>
                ) : templates && templates.length > 0 ? (
                  templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTemplate(t.id); setDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-[12px] font-sans hover:bg-muted/50 transition-colors ${
                        t.id === selectedTemplate ? "bg-muted/30 text-foreground font-semibold" : "text-foreground"
                      }`}
                    >
                      <div className="truncate">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">{t.subject}</div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-[12px] text-muted-foreground">No templates found</div>
                )}
              </div>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-white/20 border border-white/20 rounded-xl">
            <button
              onClick={() => setViewMode("desktop")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-sans transition-all ${
                viewMode === "desktop" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="w-3 h-3" />
              Desktop
            </button>
            <button
              onClick={() => setViewMode("mobile")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-sans transition-all ${
                viewMode === "mobile" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="w-3 h-3" />
              Mobile
            </button>
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-sans border transition-all ${
              darkMode
                ? "bg-gray-800 text-gray-200 border-gray-700"
                : "bg-white/20 text-muted-foreground border-white/20 hover:bg-white/30"
            }`}
          >
            {darkMode ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
            {darkMode ? "Dark" : "Light"}
          </button>
        </div>

        {/* Preview frame */}
        <div className="flex justify-center">
          <motion.div
            layout
            className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
              darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-border"
            }`}
            style={{
              width: viewMode === "desktop" ? "100%" : "375px",
              maxWidth: viewMode === "desktop" ? "680px" : "375px",
              minHeight: "400px",
            }}
          >
            {/* Browser chrome */}
            <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${
              darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-border"
            }`}>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              </div>
              <div className={`flex-1 text-center text-[10px] font-sans ${darkMode ? "text-gray-500" : "text-muted-foreground"}`}>
                {selectedTemplate ? selectedName : "Email Preview"}
              </div>
            </div>

            {/* Content */}
            <div className={`p-6 ${darkMode ? "text-gray-200" : "text-foreground"}`}>
              {selectedTemplate && templateDetail ? (
                templateDetail.htmlContent ? (
                  <div
                    className="email-preview-content"
                    style={{
                      filter: darkMode ? "invert(1) hue-rotate(180deg)" : undefined,
                      fontSize: viewMode === "mobile" ? "14px" : "16px",
                    }}
                    dangerouslySetInnerHTML={{ __html: templateDetail.htmlContent }}
                  />
                ) : (
                  <div className="space-y-3">
                    <p className={`text-[14px] font-semibold font-sans ${darkMode ? "text-gray-100" : "text-foreground"}`}>
                      Subject: {templateDetail.subject}
                    </p>
                    <p className={`text-[13px] leading-relaxed ${darkMode ? "text-gray-300" : "text-foreground/80"}`}>
                      {templateDetail.textContent || "This template has no content yet. Edit it to add email body content."}
                    </p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Monitor className={`w-10 h-10 mb-3 ${darkMode ? "text-gray-600" : "text-muted-foreground/30"}`} />
                  <p className={`text-[13px] font-sans ${darkMode ? "text-gray-500" : "text-muted-foreground"}`}>
                    Select a template to preview
                  </p>
                  <p className={`text-[11px] mt-1 ${darkMode ? "text-gray-600" : "text-muted-foreground/60"}`}>
                    Choose from your existing templates above
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </StudioCard>
    </div>
  );
}

// ===========================================================================
// 3. Copy Assistant
// ===========================================================================

function CopyAssistant() {
  const [inputText, setInputText] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [improvedText, setImprovedText] = useState("");
  const [improving, setImproving] = useState(false);
  const [copiedField, setCopiedField] = useState<"original" | "improved" | null>(null);

  const tones: { value: Tone; label: string; description: string }[] = [
    { value: "professional", label: "Professional", description: "Clear and authoritative" },
    { value: "casual", label: "Casual", description: "Relaxed and approachable" },
    { value: "urgent", label: "Urgent", description: "Time-sensitive and action-driven" },
    { value: "friendly", label: "Friendly", description: "Warm and personal" },
  ];

  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;
  const charCount = inputText.length;
  const improvedWordCount = improvedText.trim() ? improvedText.trim().split(/\s+/).length : 0;

  const handleImprove = useCallback(() => {
    if (!inputText.trim()) return;
    setImproving(true);
    // Simulate AI improvement with tone-based transformations
    setTimeout(() => {
      const text = inputText.trim();
      let result = text;
      switch (tone) {
        case "professional":
          result = text
            .replace(/\bhey\b/gi, "Hello")
            .replace(/\bawesome\b/gi, "excellent")
            .replace(/\bstuff\b/gi, "products")
            .replace(/\bcheck out\b/gi, "explore")
            .replace(/\bbuy\b/gi, "purchase");
          if (!result.endsWith(".") && !result.endsWith("!") && !result.endsWith("?")) result += ".";
          break;
        case "casual":
          result = text
            .replace(/\bpurchase\b/gi, "grab")
            .replace(/\bHello\b/gi, "Hey")
            .replace(/\binquire\b/gi, "ask about")
            .replace(/\butilize\b/gi, "use");
          break;
        case "urgent":
          if (!text.includes("!")) result = text.replace(/\.$/, "!");
          result = `Act now - ${result.charAt(0).toLowerCase()}${result.slice(1)}`;
          if (!result.includes("limited") && !result.includes("hurry")) {
            result += " Don't wait - this offer won't last!";
          }
          break;
        case "friendly":
          result = `We're excited to share this with you! ${text}`;
          result = result
            .replace(/\bpurchase\b/gi, "pick up")
            .replace(/\binform you\b/gi, "let you know");
          break;
      }
      setImprovedText(result);
      setImproving(false);
    }, 1500);
  }, [inputText, tone]);

  const copyText = useCallback((text: string, field: "original" | "improved") => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  return (
    <div
      className="space-y-6"
    >
      <StudioCard>
        <SectionHeader icon={Wand2} title="Copy Assistant" subtitle="Improve your marketing copy with AI tone adjustment" />

        {/* Tone selector */}
        <div className="mb-5">
          <h3 className="text-[11px] font-serif uppercase tracking-wider text-muted-foreground font-bold mb-3">
            Tone
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {tones.map((t) => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                className={`p-3 rounded-xl text-left transition-all border ${
                  tone === t.value
                    ? "bg-foreground/5 border-foreground/20 ring-1 ring-foreground/10"
                    : "bg-white/20 border-white/20 hover:bg-white/30"
                }`}
              >
                <span className={`block text-[12px] font-sans font-semibold ${
                  tone === t.value ? "text-foreground" : "text-foreground/70"
                }`}>
                  {t.label}
                </span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">{t.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Before / After comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Original */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-serif uppercase tracking-wider text-muted-foreground font-bold">
                Original
              </h3>
              <div className="flex items-center gap-2">
                {inputText && (
                  <button
                    onClick={() => copyText(inputText, "original")}
                    className="p-1 rounded hover:bg-white/30 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copiedField === "original" ? <Check className="w-3 h-3 text-[#6B7A2F]" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
                <span className="text-[10px] text-muted-foreground font-mono">
                  {wordCount} words / {charCount} chars
                </span>
              </div>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste your marketing copy here..."
              rows={8}
              className="w-full px-4 py-3 bg-white/30 border border-border rounded-xl text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors font-sans leading-relaxed resize-none"
            />
          </div>

          {/* Improved */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-serif uppercase tracking-wider text-muted-foreground font-bold">
                Improved
              </h3>
              <div className="flex items-center gap-2">
                {improvedText && (
                  <button
                    onClick={() => copyText(improvedText, "improved")}
                    className="p-1 rounded hover:bg-white/30 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copiedField === "improved" ? <Check className="w-3 h-3 text-[#6B7A2F]" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
                {improvedText && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {improvedWordCount} words
                  </span>
                )}
              </div>
            </div>
            <div
              className={`w-full px-4 py-3 border rounded-xl text-[13px] leading-relaxed font-sans min-h-[200px] ${
                improvedText
                  ? "bg-[#6B7A2F]/5 border-[#6B7A2F]/20 text-foreground"
                  : "bg-white/10 border-border text-muted-foreground/50"
              }`}
            >
              {improving ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[12px] font-sans">Improving copy...</span>
                </div>
              ) : improvedText ? (
                improvedText
              ) : (
                "Improved copy will appear here..."
              )}
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="flex items-center justify-center mt-5">
          <button
            onClick={handleImprove}
            disabled={improving || !inputText.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-sans font-semibold hover:opacity-90 transition-all disabled:opacity-50"
          >
            {improving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {improving ? "Improving..." : "Improve Copy"}
          </button>
        </div>
      </StudioCard>
    </div>
  );
}

// ===========================================================================
// 4. Brand Voice Check
// ===========================================================================

function BrandVoiceCheck() {
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<{
    alignmentScore: number;
    feedback: { category: string; status: "pass" | "warning" | "fail"; detail: string }[];
  } | null>(null);

  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const { data: brandProfile } = (trpc.ai.brandProfile as any).useQuery(
    { storeId },
    { enabled: !!storeId }
  ) as { data: { brandName?: string; toneAttributes?: Record<string, number>; writingStyle?: string } | undefined };

  const handleAnalyze = useCallback(() => {
    if (!text.trim()) return;
    setAnalyzing(true);
    setTimeout(() => {
      const lower = text.toLowerCase();
      const feedback: { category: string; status: "pass" | "warning" | "fail"; detail: string }[] = [];
      let score = 60;

      // Tone analysis
      const toneAttrs = brandProfile?.toneAttributes ?? {};
      const toneKeys = Object.keys(toneAttrs);
      if (toneKeys.length > 0) {
        const formalWords = /\b(therefore|furthermore|regarding|accordingly|subsequently)\b/i;
        const casualWords = /\b(hey|awesome|cool|gonna|wanna|stuff|btw)\b/i;
        const isFormal = formalWords.test(text);
        const isCasual = casualWords.test(text);

        if (toneAttrs["formal"] && isFormal) {
          feedback.push({ category: "Tone Match", status: "pass", detail: "Text matches your formal brand tone" });
          score += 10;
        } else if (toneAttrs["casual"] && isCasual) {
          feedback.push({ category: "Tone Match", status: "pass", detail: "Text matches your casual brand tone" });
          score += 10;
        } else if (toneKeys.length > 0) {
          feedback.push({ category: "Tone Match", status: "warning", detail: `Consider aligning with your brand tone: ${toneKeys.slice(0, 3).join(", ")}` });
        }
      } else {
        feedback.push({ category: "Tone Match", status: "warning", detail: "No brand profile found - set up your brand voice in Settings" });
      }

      // Length & readability
      const sentences = text.split(/[.!?]+/).filter(Boolean);
      const avgSentenceLen = sentences.length > 0 ? text.split(/\s+/).length / sentences.length : 0;
      if (avgSentenceLen > 25) {
        feedback.push({ category: "Readability", status: "warning", detail: "Sentences are long (avg " + Math.round(avgSentenceLen) + " words). Consider breaking them up." });
        score -= 5;
      } else if (avgSentenceLen > 0) {
        feedback.push({ category: "Readability", status: "pass", detail: "Good sentence length (avg " + Math.round(avgSentenceLen) + " words)" });
        score += 5;
      }

      // CTA presence
      const hasCTA = /\b(shop now|buy|order|get|claim|grab|discover|explore|try|start|join|sign up|learn more|click)\b/i.test(text);
      if (hasCTA) {
        feedback.push({ category: "Call to Action", status: "pass", detail: "Contains a clear call to action" });
        score += 10;
      } else {
        feedback.push({ category: "Call to Action", status: "fail", detail: "Missing a call to action - add a clear CTA" });
        score -= 10;
      }

      // Personalization
      const hasPersonalization = /\{.*?\}|\byou\b|\byour\b/i.test(text);
      if (hasPersonalization) {
        feedback.push({ category: "Personalization", status: "pass", detail: "Uses personal language or tokens" });
        score += 5;
      } else {
        feedback.push({ category: "Personalization", status: "warning", detail: "Consider adding 'you/your' or personalization tokens" });
      }

      // Brand name usage
      if (brandProfile?.brandName && lower.includes(brandProfile.brandName.toLowerCase())) {
        feedback.push({ category: "Brand Mention", status: "pass", detail: `References your brand name "${brandProfile.brandName}"` });
        score += 5;
      } else if (brandProfile?.brandName) {
        feedback.push({ category: "Brand Mention", status: "warning", detail: `Consider mentioning your brand "${brandProfile.brandName}"` });
      }

      // Spam language
      const spamHits = SPAM_WORDS.filter((w) => lower.includes(w));
      if (spamHits.length > 0) {
        feedback.push({ category: "Spam Language", status: "fail", detail: `Contains spam triggers: ${spamHits.join(", ")}` });
        score -= 15;
      } else {
        feedback.push({ category: "Spam Language", status: "pass", detail: "No spam language detected" });
        score += 5;
      }

      setAnalysis({ alignmentScore: Math.max(0, Math.min(100, score)), feedback });
      setAnalyzing(false);
    }, 1500);
  }, [text, brandProfile]);

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-5 gap-6"
    >
      {/* Left: Input */}
      <div className="lg:col-span-3">
        <StudioCard>
          <SectionHeader icon={ShieldCheck} title="Brand Voice Check" subtitle="Analyze text against your brand profile" />

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste any marketing text to check against your brand voice..."
            rows={10}
            className="w-full px-4 py-3 bg-white/30 border border-border rounded-xl text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors font-sans leading-relaxed resize-none"
          />

          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-muted-foreground font-mono">
              {text.trim() ? text.trim().split(/\s+/).length : 0} words
            </span>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !text.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-[12px] font-sans font-semibold hover:opacity-90 transition-all disabled:opacity-50"
            >
              {analyzing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {analyzing ? "Analyzing..." : "Analyze"}
            </button>
          </div>
        </StudioCard>
      </div>

      {/* Right: Results */}
      <div className="lg:col-span-2 space-y-6">
        <StudioCard>
          <h3 className="text-[11px] font-serif uppercase tracking-wider text-muted-foreground font-bold mb-4">
            Alignment Score
          </h3>
          {analysis ? (
            <ScoreGauge score={analysis.alignmentScore} />
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-[12px] text-muted-foreground font-sans text-center">
                Paste text and click Analyze
              </p>
            </div>
          )}
        </StudioCard>

        <StudioCard>
          <h3 className="text-[11px] font-serif uppercase tracking-wider text-muted-foreground font-bold mb-4">
            Feedback
          </h3>
          {analysis && analysis.feedback.length > 0 ? (
            <div className="space-y-3">
              {analysis.feedback.map((item, i) => {
                const Icon = item.status === "pass" ? CheckCircle : item.status === "warning" ? AlertTriangle : XCircle;
                const color = item.status === "pass" ? "#6B7A2F" : item.status === "warning" ? "#B8963E" : "#c4704a";
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: `${color}15` }}
                    >
                      <Icon className="w-3 h-3" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-sans font-semibold text-foreground">{item.category}</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center">
              <ShieldCheck className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-[12px] text-muted-foreground">Feedback will appear after analysis</p>
            </div>
          )}
        </StudioCard>
      </div>
    </div>
  );
}
