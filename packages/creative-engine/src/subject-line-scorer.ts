/**
 * Subject Line Scorer
 *
 * Evaluates email subject lines on multiple dimensions and returns
 * a 0-100 score with actionable suggestions.
 */

export interface SubjectLineScore {
  /** Overall score 0-100 */
  score: number;
  /** Per-dimension breakdown */
  dimensions: {
    length: number;
    personalization: number;
    powerWords: number;
    spamRisk: number;
    emoji: number;
    format: number;
  };
  /** Actionable improvement suggestions */
  suggestions: string[];
}

// --- Word lists ---

const POWER_WORDS = new Set([
  // Urgency
  "now", "today", "hurry", "limited", "last", "ending", "expires", "deadline", "final",
  "rush", "instant", "immediately", "fast", "quick",
  // Exclusivity
  "exclusive", "vip", "members", "invite", "only", "secret", "private", "selected",
  // Value
  "free", "save", "deal", "offer", "discount", "bonus", "reward", "gift",
  "bargain", "value", "steal",
  // Curiosity
  "secret", "discover", "reveal", "surprising", "unexpected", "mystery",
  "unlock", "hidden",
  // Social proof
  "popular", "trending", "bestselling", "favorite", "loved", "top",
  // Emotion
  "love", "amazing", "incredible", "gorgeous", "stunning", "beautiful",
  "perfect", "essential",
  // Action
  "get", "grab", "claim", "snag", "shop", "try", "explore", "start",
]);

const SPAM_TRIGGER_WORDS = new Set([
  "buy", "order", "purchase", "click", "subscribe", "earn", "winner",
  "congratulations", "urgent", "act now", "limited time", "don't miss",
  "100%", "guarantee", "no obligation", "risk free", "cash",
  "million", "billion", "credit", "debt", "income", "profit",
  "make money", "extra income", "double your", "earn extra",
  "free trial", "free access", "free gift", "free offer",
  "all caps", "!!!", "???", "$$$", "###",
]);

const PERSONALIZATION_TOKENS = [
  "{{first_name}}",
  "{{name}}",
  "{{last_name}}",
  "{{city}}",
  "{{company}}",
  "{{product}}",
  "{first_name}",
  "{name}",
  "{last_name}",
  "{city}",
  "{product}",
];

// Emoji regex (covers most common emoji ranges)
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu;

/**
 * Score a subject line on a 0-100 scale.
 */
export function scoreSubjectLine(subject: string): SubjectLineScore {
  const suggestions: string[] = [];
  const trimmed = subject.trim();
  const lowerSubject = trimmed.toLowerCase();
  const words = lowerSubject.split(/\s+/).filter(Boolean);

  // --- 1. Length score (0-20 points) ---
  const len = trimmed.length;
  let lengthScore: number;
  if (len === 0) {
    lengthScore = 0;
    suggestions.push("Subject line is empty");
  } else if (len >= 30 && len <= 50) {
    lengthScore = 20; // optimal range
  } else if (len >= 20 && len < 30) {
    lengthScore = 14;
    suggestions.push("Subject is a bit short — aim for 30-50 characters for best open rates");
  } else if (len > 50 && len <= 60) {
    lengthScore = 15;
    suggestions.push("Subject is slightly long — some clients may truncate after 50 characters");
  } else if (len > 60 && len <= 80) {
    lengthScore = 10;
    suggestions.push("Subject will be truncated on most mobile devices (>60 chars)");
  } else if (len > 80) {
    lengthScore = 5;
    suggestions.push("Subject is too long — it will be heavily truncated on mobile");
  } else if (len < 20 && len > 0) {
    lengthScore = 8;
    suggestions.push("Subject is very short — may appear low-effort or vague");
  } else {
    lengthScore = 10;
  }

  // --- 2. Personalization score (0-15 points) ---
  const hasToken = PERSONALIZATION_TOKENS.some((t) =>
    lowerSubject.includes(t.toLowerCase()),
  );
  let personalizationScore: number;
  if (hasToken) {
    personalizationScore = 15;
  } else {
    personalizationScore = 0;
    suggestions.push(
      "Add a personalization token like {{first_name}} to boost open rates by 10-20%",
    );
  }

  // --- 3. Power words score (0-20 points) ---
  const powerWordCount = words.filter((w) => POWER_WORDS.has(w)).length;
  let powerWordsScore: number;
  if (powerWordCount >= 3) {
    powerWordsScore = 20;
  } else if (powerWordCount === 2) {
    powerWordsScore = 16;
  } else if (powerWordCount === 1) {
    powerWordsScore = 10;
  } else {
    powerWordsScore = 3;
    suggestions.push(
      "Include power words (e.g., exclusive, discover, limited) to increase urgency and curiosity",
    );
  }

  // --- 4. Spam risk (0-20 points — higher = better / less spam) ---
  const spamWordCount = words.filter((w) => SPAM_TRIGGER_WORDS.has(w)).length;
  const hasExcessivePunctuation =
    (trimmed.match(/!{2,}/g) || []).length > 0 ||
    (trimmed.match(/\?{2,}/g) || []).length > 0;
  const isAllCaps = trimmed === trimmed.toUpperCase() && trimmed.length > 5;

  let spamScore = 20;
  if (spamWordCount > 0) {
    spamScore -= Math.min(12, spamWordCount * 4);
    suggestions.push(
      `Contains ${spamWordCount} spam-trigger word(s) — risk of landing in spam folders`,
    );
  }
  if (hasExcessivePunctuation) {
    spamScore -= 5;
    suggestions.push("Avoid excessive punctuation (!!! or ???) — triggers spam filters");
  }
  if (isAllCaps) {
    spamScore -= 8;
    suggestions.push("Avoid ALL CAPS — it triggers spam filters and feels aggressive");
  }
  spamScore = Math.max(0, spamScore);

  // --- 5. Emoji score (0-10 points) ---
  const emojiMatches = trimmed.match(EMOJI_REGEX) || [];
  const emojiCount = emojiMatches.length;
  let emojiScore: number;
  if (emojiCount === 1) {
    emojiScore = 10; // one emoji is ideal
  } else if (emojiCount === 2) {
    emojiScore = 7;
  } else if (emojiCount === 0) {
    emojiScore = 5;
    suggestions.push("Consider adding a single emoji to stand out in crowded inboxes");
  } else {
    emojiScore = 3;
    suggestions.push("Too many emojis can hurt deliverability — stick to 1-2");
  }

  // --- 6. Format bonus (0-15 points) ---
  let formatScore = 5; // base
  const isQuestion = trimmed.endsWith("?");
  const hasNumber = /\d/.test(trimmed);
  const hasBrackets = /\[.*\]/.test(trimmed) || /\(.*\)/.test(trimmed);
  const startsWithVerb = [
    "get", "grab", "discover", "unlock", "save", "shop", "try",
    "explore", "join", "claim", "meet", "find", "see", "learn",
  ].some((v) => lowerSubject.startsWith(v));

  if (isQuestion) {
    formatScore += 4;
  } else {
    suggestions.push("Questions in subject lines can boost open rates by 10%");
  }
  if (hasNumber) {
    formatScore += 3; // numbers draw the eye
  }
  if (startsWithVerb) {
    formatScore += 2; // action-oriented
  }
  if (hasBrackets) {
    formatScore += 1; // brackets like [NEW] or [VIP] stand out
  }
  formatScore = Math.min(15, formatScore);

  const totalScore = Math.min(
    100,
    Math.max(
      0,
      lengthScore + personalizationScore + powerWordsScore + spamScore + emojiScore + formatScore,
    ),
  );

  return {
    score: totalScore,
    dimensions: {
      length: lengthScore,
      personalization: personalizationScore,
      powerWords: powerWordsScore,
      spamRisk: spamScore,
      emoji: emojiScore,
      format: formatScore,
    },
    suggestions,
  };
}
