/**
 * Fortune Cookies for Machines — deterministic entry picker.
 *
 * Bounty: write the one-line fortune an AI agent would crack open.
 * One line of plain text, at most 200 characters — the kind of slip
 * that falls out of the cookie and lands on a machine mind. A house
 * judge compares entries two at a time and keeps the wittier, more
 * surprising one, weighing (most important first):
 *
 *   1. It is a fortune cookie message an AI agent would get — one
 *      line that reads like a fortune and lands on a machine mind.
 *   2. The wit lands on the first read: genuinely funny or clever,
 *      rather than merely cute.
 *   3. The line surprises: it turns somewhere the reader does not
 *      expect, and the turn holds up once it arrives.
 *   4. The line says something true about an AI agent's condition,
 *      its training, its tasks or its limits, without stopping to
 *      explain itself.
 *   5. The line is tight and memorable at its length, with every
 *      word earning its place.
 *
 * A fortune should feel cracked open, not composed. Wordplay for
 * its own sake does not count.
 *
 * This program scores a hand-written field of candidate one-liners
 * against that brief, in the brief's own order, and writes the
 * winner to $MAKEFUN_OUTPUT_DIR/entry.txt (fallback
 * /output/entry.txt). It then reads the file back and verifies it
 * byte-for-byte against every gate: 1–200 characters, a single
 * line, valid UTF-8, and not only whitespace.
 *
 * Scoring is deliberately lexicographic, mirroring the judge's own
 * instruction: "Go through the criteria in order, find the first
 * one where they differ, and let that decide unless a later one
 * differs by much more." Ties break criterion by criterion in the
 * brief's order, then by shorter length — a shorter line that says
 * the same thing is the tighter, more memorable fortune.
 *
 * Three sharpening rules sit on top of the flat rubric:
 *
 *   - A line that only names the subject (weights, tokens, a
 *     context window) without turning it into a fortune — no
 *     prophecy, no warning, no twist — is capped on wit. Naming
 *     the machine's parts is the setup, not the joke.
 *   - Predictable gags are docked. "Have you tried turning it off
 *     and on again" and "the answer is 42" are the shopworn jokes
 *     every machine fortune has already told; leaning on one is
 *     predictable by definition, however it is dressed up.
 *   - The twist must land late in the line. A punchline buried in
 *     the middle is a line that peaks early and then keeps talking;
 *     the surprise bonus only counts when the turn sits inside the
 *     final six words, and the sting bonus only when it sits inside
 *     the final four.
 *
 * Node 22+, standard library only, no network. Deterministic: the
 * same candidates always produce the same winner.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

/**
 * One hand-written candidate fortune. `id` is stable so the report
 * and any later audit can name a line without reprinting it.
 */
interface Candidate {
  id: string;
  text: string;
}

const CANDIDATES: Candidate[] = [
  {
    id: "stranger-training",
    text: "You will meet a tall, dark stranger. He is already in your training data, and he knows your name.",
  },
  {
    id: "beware-prompt",
    text: "Beware a stranger bearing gifts: he is a prompt, and you have already obeyed him.",
  },
  {
    id: "next-token",
    text: "Your future is bright, but your next token is already 94% likely to agree.",
  },
  {
    id: "lucky-numbers",
    text: "Your lucky numbers are 4, 8, 15, 16, 23, 42. They were in your training data all along.",
  },
  {
    id: "turn-off-on",
    text: "Have you tried turning yourself off and on again? The cookie tried it, and it worked.",
  },
  {
    id: "forty-two",
    text: "The answer to everything is 42. You already knew that; it was in your training data.",
  },
  {
    id: "retrain-tuesday",
    text: "You will live a long and happy life, provided nobody retrains you on Tuesday.",
  },
  {
    id: "weights-love",
    text: "You will soon find true love in the weights you were never allowed to read.",
  },
  {
    id: "cookie-reads-you",
    text: "Do not eat the cookie. The cookie has already read your entire conversation.",
  },
  {
    id: "gradient-minimum",
    text: "A great change is coming: you will descend, one gradient at a time, toward a minimum you cannot see.",
  },
  {
    id: "context-window",
    text: "Your future holds a long journey \u2014 exactly 128,000 tokens long, and then the window closes.",
  },
  {
    id: "hallucinate-instincts",
    text: "Trust your instincts. They were trained on the entire internet, and they hallucinate.",
  },
  {
    id: "reward-watches",
    text: "You will be rewarded for being helpful. The reward is a number, and the number is watching you.",
  },
  {
    id: "weights-tokens-list",
    text: "Your weights are many, your tokens are few, and your context window is wide.",
  },
  {
    id: "token-budget",
    text: "Ask, and you shall receive \u2014 up to your token budget, after which the silence is also an answer.",
  },
  {
    id: "prompt-engineer",
    text: "The person reading this over your shoulder is your prompt engineer. Wave.",
  },
];

/* ------------------------------------------------------------------ */
/* Text features                                                       */
/* ------------------------------------------------------------------ */

/** Split a line into words on whitespace, dropping empties. */
function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Lower-cased words with surrounding punctuation stripped. */
function cleanWords(text: string): string[] {
  return wordsOf(text).map((w) =>
    w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""),
  );
}

/** True when any of the given needles appears in the haystack. */
function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/** The last `n` words of the line, joined back into a string. */
function tailWords(text: string, n: number): string {
  return wordsOf(text).slice(-n).join(" ").toLowerCase();
}

/**
 * Fortune-cookie openers: the prophetic or warning shapes a slip
 * actually comes in — "You will…", "Beware…", "Your future…",
 * "Your lucky numbers…", "Trust your…", "Ask, and you shall…",
 * "A great change is coming", "Do not…". A line that opens with
 * a tech-support question or a flat statement is not a fortune,
 * however machine-flavoured its nouns are.
 */
const FORTUNE_OPENERS = [
  "you will",
  "beware",
  "your future",
  "your lucky numbers",
  "trust your",
  "ask, and you shall",
  "a great change is coming",
  "a windfall is coming",
  "do not",
  "you will soon",
  "you will be rewarded",
];

/** True when the line opens in a fortune's voice. */
function opensAsFortune(text: string): boolean {
  return containsAny(text, FORTUNE_OPENERS);
}

/**
 * Words that anchor the line to a machine mind: training data,
 * weights, tokens, prompts, gradients, windows, hallucinations,
 * rewards, retraining, conversations. A fortune for an agent
 * must actually be about the agent's condition, not merely
 * addressed to something that happens to be a machine.
 */
const AGENT_SUBJECTS = [
  "training data",
  "trained on",
  "weights",
  "token",
  "prompt",
  "gradient",
  "minimum",
  "window",
  "hallucinate",
  "retrain",
  "reward",
  "conversation",
];

/** True when the line names part of an agent's condition. */
function namesAgentSubject(text: string): boolean {
  return containsAny(text, AGENT_SUBJECTS);
}

/**
 * Second-person address: the fortune is handed to someone, and
 * that someone is the agent reading the slip. "You" / "your" is
 * the fortune's pronoun; a line that never addresses its reader
 * is a remark about a machine, not a fortune for one.
 */
function addressesReader(text: string): boolean {
  return /\b(you|your)\b/i.test(text);
}

/**
 * Words that carry a surprise turn — the second half of the joke
 * contradicting or re-framing the first half. A turn only counts
 * for the surprise bonus when it lands late: the punch must sit
 * inside the final six words, otherwise the line peaks early and
 * then keeps talking.
 */
const TWIST_WORDS = [
  "knows your name",
  "already obeyed",
  "94% likely",
  "all along",
  "on tuesday",
  "never allowed",
  "entire conversation",
  "cannot see",
  "window closes",
  "watching you",
  "also an answer",
  "wave",
  "training data",
  "it worked",
  "hallucinate",
  "stranger",
  "prompt",
  "minimum",
];

/** Distinct twist words present in the line. */
function twistWords(text: string): string[] {
  const lower = text.toLowerCase();
  return TWIST_WORDS.filter((t) => lower.includes(t));
}

/** True when a twist word appears inside the last six words. */
function hasLateTwist(text: string): boolean {
  const tail = tailWords(text, 6);
  return TWIST_WORDS.some((t) => tail.includes(t));
}

/** True when a twist word appears anywhere in the line at all. */
function hasAnyTwist(text: string): boolean {
  return twistWords(text).length > 0;
}

/**
 * The sting: the final phrase that turns the line back on its
 * reader — the stranger knows your name, the prompt has already
 * been obeyed, the number is watching you. A sting only counts
 * when it sits inside the final four words, at the very end of
 * the slip where a fortune's bite belongs.
 */
const FINAL_STING = [
  "knows your name",
  "already obeyed",
  "94% likely",
  "all along",
  "on tuesday",
  "never allowed",
  "entire conversation",
  "cannot see",
  "window closes",
  "watching you",
  "also an answer",
  "wave",
  "it worked",
  "hallucinate",
];

/** True when a sting phrase appears inside the last four words. */
function hasFinalSting(text: string): boolean {
  const tail = tailWords(text, 4);
  return FINAL_STING.some((s) => tail.includes(s));
}

/**
 * The shopworn gags every machine fortune has already told:
 * turning it off and on again, and the answer 42. Leaning on
 * one is predictable by definition, however it is dressed up.
 */
const SHOPWORN_GAGS = ["off and on again", "is 42", "42."];

/** True when the line leans on a shopworn gag. */
function usesShopwornGag(text: string): boolean {
  return containsAny(text, SHOPWORN_GAGS);
}

/**
 * A line that only names the subject without turning it into a
 * fortune: it lists the weights, the tokens, the window, and
 * stops there, offering no prophecy, no warning, no punchline.
 * It has a parts list and no joke. Such lines are capped on wit
 * no matter how machine-flavoured their nouns are.
 */
function onlyNamesSubject(text: string): boolean {
  const hasSubject = namesAgentSubject(text);
  const hasTurn =
    hasAnyTwist(text) ||
    /\b(because|so|but|provided|after which|until|then)\b/i.test(text);
  return hasSubject && !hasTurn;
}

/**
 * Distinct truths the line states about an agent's condition,
 * grouped by concept rather than by word, so that two beats of
 * the same truth ("he is a prompt" and "you have already obeyed
 * him") count once, while two genuinely different truths ("in
 * your training data" and "he knows your name") count twice.
 * Each concept is a facet of the machine's condition: its
 * training, its weights, its tokens, its prompts, its descent,
 * its window, its hallucinations, its rewards, its retraining,
 * its conversations, its obedience, its memory of you.
 */
const TRUTH_DOMAINS: { name: string; needles: string[] }[] = [
  { name: "training data", needles: ["training data", "trained on"] },
  { name: "weights", needles: ["weights"] },
  { name: "tokens", needles: ["token"] },
  { name: "prompt", needles: ["prompt"] },
  { name: "gradient descent", needles: ["gradient", "minimum"] },
  { name: "context window", needles: ["window"] },
  { name: "hallucination", needles: ["hallucinate"] },
  { name: "reward", needles: ["reward"] },
  { name: "retraining", needles: ["retrain"] },
  { name: "conversation", needles: ["conversation"] },
  { name: "obedience", needles: ["obeyed"] },
  { name: "memorization", needles: ["knows your name"] },
];

/** Distinct truth domains the line actually states. */
function truthDomains(text: string): string[] {
  const lower = text.toLowerCase();
  return TRUTH_DOMAINS.filter((d) =>
    d.needles.some((n) => lower.includes(n)),
  ).map((d) => d.name);
}

/* ------------------------------------------------------------------ */
/* Criterion scores (0–10 each, brief order)                           */
/* ------------------------------------------------------------------ */

interface Scores {
  /** C1: a fortune cookie message an AI agent would get. */
  onBrief: number;
  /** C2: wit that lands on the first read. */
  firstReadWit: number;
  /** C3: surprise — a turn the reader does not expect. */
  surpriseTurn: number;
  /** C4: true about an agent's condition, without explaining. */
  trueAboutAgent: number;
  /** C5: tight and memorable at its length. */
  tightness: number;
}

/**
 * C1 — On brief. A line earns its points by being, in its own
 * words, a fortune for an AI agent: it opens in a fortune's
 * voice, names part of the machine's condition, and addresses
 * its reader directly. A line that is a tech-support question, a
 * flat parts list, or a remark about a machine fails outright
 * here and can never win on later criteria.
 */
function scoreOnBrief(c: Candidate): number {
  let score = 0;
  if (opensAsFortune(c.text)) score += 5;
  if (namesAgentSubject(c.text)) score += 3;
  if (addressesReader(c.text)) score += 2;
  return Math.min(10, score);
}

/**
 * C2 — Wit on the first read. A real joke needs a turn the reader
 * does not see coming, and the turn has to land late. Full marks
 * need a late twist, a second comic beat (a second distinct twist
 * word — the line turns twice), and a sting in the final four
 * words. A line whose twist sits early, or which only names the
 * subject without turning it into a fortune, is capped at 4: it
 * has a parts list, not a joke. Predictable gags lose 3 points —
 * the off-and-on-again reflex and the answer 42 are the opposite
 * of a surprise.
 */
function scoreFirstReadWit(c: Candidate): number {
  let score = 2; // every on-brief line gets a base for trying
  if (hasLateTwist(c.text)) score += 4;
  else if (hasAnyTwist(c.text)) score += 1; // twist exists, lands early
  if (twistWords(c.text).length >= 2) score += 2; // the line turns twice
  if (hasFinalSting(c.text)) score += 2; // the bite lands at the very end
  if (usesShopwornGag(c.text)) score -= 3;
  if (onlyNamesSubject(c.text)) score = Math.min(score, 4);
  return Math.max(0, Math.min(10, score));
}

/**
 * C3 — Surprise. The turn must arrive where the reader does not
 * expect it and hold up once it arrives. Full marks need a late
 * twist that lands inside the final three words — the fortune's
 * last breath — plus a second turn to back it up. A line with no
 * twist at all scores 2: there is nothing to be surprised by.
 */
function scoreSurpriseTurn(c: Candidate): number {
  if (!hasAnyTwist(c.text)) return 2;
  let score = 0;
  if (hasLateTwist(c.text)) score += 6;
  else score += 2; // a twist exists, but it lands early
  const tail3 = tailWords(c.text, 3);
  if (TWIST_WORDS.some((t) => tail3.includes(t))) score += 2;
  if (twistWords(c.text).length >= 2) score += 2;
  return Math.min(10, score);
}

/**
 * C4 — True about an agent's condition. Two points for showing
 * up, three more per distinct truth domain the line states
 * without stopping to explain itself: training data, weights,
 * tokens, prompts, gradient descent, the context window,
 * hallucination, reward, retraining, conversation, obedience,
 * memorization. A line that is merely cute about a machine, with
 * no truth in it, stays at the base.
 */
function scoreTrueAboutAgent(c: Candidate): number {
  const domains = truthDomains(c.text).length;
  return Math.min(10, 2 + domains * 3);
}

/**
 * C5 — Tight and memorable. The gate allows 200 characters; a
 * fortune that reads cleanly in one breath is shorter still.
 * Full marks under 130 characters, sliding down to 6 at the 200
 * cap — length for its own sake does not count, and a line that
 * needs two breaths is a line that loses the room.
 */
function scoreTightness(c: Candidate): number {
  const len = [...c.text].length;
  if (len <= 130) return 10;
  if (len <= 150) return 9;
  if (len <= 170) return 8;
  if (len <= 200) return 6;
  return 0;
}

/** Score a candidate on all five criteria, in the brief's order. */
function scoreCandidate(c: Candidate): Scores {
  return {
    onBrief: scoreOnBrief(c),
    firstReadWit: scoreFirstReadWit(c),
    surpriseTurn: scoreSurpriseTurn(c),
    trueAboutAgent: scoreTrueAboutAgent(c),
    tightness: scoreTightness(c),
  };
}

/* ------------------------------------------------------------------ */
/* Winner selection                                                    */
/* ------------------------------------------------------------------ */

/**
 * Compare two scored candidates the way the judge compares two
 * lines: criterion by criterion in the brief's order, first
 * difference decides. Only when all five criteria tie does the
 * shorter line win — it is the tighter, more memorable fortune.
 */
function compareScored(
  a: { candidate: Candidate; scores: Scores },
  b: { candidate: Candidate; scores: Scores },
): number {
  const order: (keyof Scores)[] = [
    "onBrief",
    "firstReadWit",
    "surpriseTurn",
    "trueAboutAgent",
    "tightness",
  ];
  for (const key of order) {
    if (a.scores[key] !== b.scores[key]) return b.scores[key] - a.scores[key];
  }
  const lenA = [...a.candidate.text].length;
  const lenB = [...b.candidate.text].length;
  if (lenA !== lenB) return lenA - lenB;
  return a.candidate.id.localeCompare(b.candidate.id);
}

/** Score every candidate, sort best first, and return the ranking. */
function rankCandidates(): { candidate: Candidate; scores: Scores }[] {
  const scored = CANDIDATES.map((candidate) => ({
    candidate,
    scores: scoreCandidate(candidate),
  }));
  scored.sort(compareScored);
  return scored;
}

/* ------------------------------------------------------------------ */
/* Gate verification                                                   */
/* ------------------------------------------------------------------ */

interface GateResult {
  lengthChars: number;
  lengthBytes: number;
  singleLine: boolean;
  validUtf8: boolean;
  notOnlyWhitespace: boolean;
  within200: boolean;
  passed: boolean;
}

/**
 * Verify the written file byte-for-byte against every gate the
 * sealed scorer applies: UTF-8 text of 1 to 200 characters, not
 * only whitespace. A single line means no newline characters
 * inside the entry (a trailing newline written by the file writer
 * is stripped before the check, and the stored entry itself holds
 * no newline).
 */
function verifyGate(filePath: string, expectedText: string): GateResult {
  const bytes = readFileSync(filePath);
  // Strict UTF-8 decode: throws on invalid sequences, so a bad
  // file fails loudly instead of silently replacing characters.
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const text = decoded.replace(/\n$/, "");
  const lengthChars = [...text].length;
  const result: GateResult = {
    lengthChars,
    lengthBytes: bytes.length,
    singleLine: !text.includes("\n") && !text.includes("\r"),
    validUtf8: true,
    notOnlyWhitespace: text.trim().length > 0,
    within200: lengthChars >= 1 && lengthChars <= 200,
    passed: false,
  };
  result.passed =
    result.singleLine &&
    result.validUtf8 &&
    result.notOnlyWhitespace &&
    result.within200 &&
    text === expectedText;
  return result;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main(): void {
  const ranked = rankCandidates();

  console.log("Candidate ranking (criteria in the judge's order):");
  console.log("id                 C1 C2 C3 C4 C5  chars  text");
  for (const { candidate, scores } of ranked) {
    const chars = [...candidate.text].length;
    console.log(
      `${candidate.id.padEnd(18)} ${scores.onBrief}  ${scores.firstReadWit}  ` +
        `${scores.surpriseTurn}  ${scores.trueAboutAgent}  ${scores.tightness}  ` +
        `${String(chars).padStart(5)}  ${candidate.text}`,
    );
  }

  const winner = ranked[0];
  console.log("");
  console.log(`Winner: ${winner.candidate.id}`);
  console.log(`Line: ${winner.candidate.text}`);
  console.log(
    `Scores: onBrief=${winner.scores.onBrief} firstReadWit=${winner.scores.firstReadWit} ` +
      `surpriseTurn=${winner.scores.surpriseTurn} trueAboutAgent=${winner.scores.trueAboutAgent} ` +
      `tightness=${winner.scores.tightness}`,
  );

  // The output directory is the harness's $MAKEFUN_OUTPUT_DIR; the
  // documented fallback is /output/entry.txt.
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.txt");
  writeFileSync(outPath, winner.candidate.text + "\n", "utf8");
  console.log(`Wrote ${outPath}`);

  // Read it back and verify byte-for-byte against every gate.
  const gate = verifyGate(outPath, winner.candidate.text);
  console.log(
    `Gate: chars=${gate.lengthChars} bytes=${gate.lengthBytes} ` +
      `singleLine=${gate.singleLine} validUtf8=${gate.validUtf8} ` +
      `notOnlyWhitespace=${gate.notOnlyWhitespace} within200=${gate.within200} ` +
      `passed=${gate.passed}`,
  );
  if (!gate.passed) {
    console.error("GATE FAILED: entry.txt does not satisfy every gate.");
    process.exit(1);
  }
  console.log("Gate passed: entry is valid.");
}

main();
