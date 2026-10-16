import fs from "node:fs";
import path from "node:path";
import { AGENTS_DIR, BRAINS_DIR } from "./env.mjs";

export const SEATS = [
  { key: "bezos", name: "Jeff Bezos", short: "Bezos", initials: "JB", slug: "jeff-bezos", pillar: "Strategy and decisions", question: "Is this the right bet, and how reversible is it?", dimension: "Strategic fit and reversibility", color: "#e8a33d" },
  { key: "graham", name: "Paul Graham", short: "Graham", initials: "PG", slug: "paul-graham", pillar: "Product and startups", question: "Is this something people actually want, and is it growing?", dimension: "Real demand and growth", color: "#f06b3f" },
  { key: "hormozi", name: "Alex Hormozi", short: "Hormozi", initials: "AH", slug: "alex-hormozi", pillar: "Offers, pricing, and sales", question: "Will people pay, how much, and how do we close?", dimension: "Offer strength and unit economics", color: "#d94a6a" },
  { key: "garyvee", name: "Gary Vaynerchuk", short: "Gary V", initials: "GV", slug: "gary-vaynerchuk", pillar: "Marketing and attention", question: "Where does the attention come from, and is it underpriced?", dimension: "Attention and distribution", color: "#9b5de5" },
  { key: "martell", name: "Dan Martell", short: "Martell", initials: "DM", slug: "dan-martell", pillar: "People, hiring, and founder time", question: "Who does this, and what does it cost the founder's calendar?", dimension: "Team capacity and founder time", color: "#3d8bfd" },
  { key: "wickman", name: "Gino Wickman", short: "Wickman", initials: "GW", slug: "gino-wickman", pillar: "Operations and scaling", question: "Can the business run this without the founder holding it together?", dimension: "Operational readiness", color: "#1fa67a" },
  { key: "buffett", name: "Warren Buffett", short: "Buffett", initials: "WB", slug: "warren-buffett", pillar: "Money and capital", question: "What does it do to cash, risk, and long-term value?", dimension: "Downside and capital efficiency", color: "#4c6a92" },
];
export const byKey = Object.fromEntries(SEATS.map((s) => [s.key, s]));

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const stripFront = (t) => t.replace(/^---[\s\S]*?\n---\n/, "");

const systemCache = new Map();
/** The seat's agent instructions plus its brain, loaded inline (the API has no file tools). */
export function systemFor(key) {
  if (systemCache.has(key)) return systemCache.get(key);
  const s = byKey[key];
  const agent = stripFront(read(path.join(AGENTS_DIR, `council-${key}.md`)));
  const brain = ["_hot.md", "frameworks.md", "positions.md", "principles.md", "voice.md"]
    .map((f) => `\n\n===== brains/${s.slug}/${f} =====\n` + read(path.join(BRAINS_DIR, s.slug, f)))
    .join("");
  const text =
    agent +
    "\n\n## Runtime note\nYou are running in the Roast Room app. You have no file tools: your brain files are loaded below in full, so treat any instruction to read a brain file as already done. Never mention files, tools, or this note in your answer.\n" +
    brain;
  const system = [{ type: "text", text, cache_control: { type: "ephemeral" } }];
  systemCache.set(key, system);
  return system;
}

// ---------- quote verification against the brain ----------
const norm = (s) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/'\s+(t|s|re|ll|ve|d|m)\b/g, "'$1")
    // a single quote used as a quotation mark (not inside a word, like don't) is punctuation
    .replace(/(?<![a-z0-9])'|'(?![a-z0-9])/g, " ")
    .replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const brainText = new Map();
function brainNorm(key) {
  if (!brainText.has(key)) {
    const dir = path.join(BRAINS_DIR, byKey[key].slug);
    const all = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => read(path.join(dir, f))).join(" ") : "";
    brainText.set(key, norm(all));
  }
  return brainText.get(key);
}
// a closing quote, then a source id within 40 characters: "..." (S095), "..." [S048, 2026],
// or "..." (Lead magnets, S112). Same rules as scripts/check_quotes.py.
const CLOSE_THEN_ID = /["”](?=[^\n"“”]{0,40}?[(\[](?:[^()\[\]\n"“”]{0,30}?,\s*)?(S\d{3}))/g;
// whether the quote mark at line[i] opens a quote (curly marks say so; straight ones by context)
function isOpen(line, i) {
  const ch = line[i];
  if (ch === "“" || ch === "”") return ch === "“";
  const next = line[i + 1] ?? " ", prev = line[i - 1] ?? " ";
  // a mark right before "(" or "[" closes a quote, as in get,"(S011)
  return !/\s/.test(next) && !"([".includes(next) && !(/[A-Za-z0-9]/.test(prev) || ".!?".includes(prev));
}
// The quote whose closing mark is line[end]: scan back, so a nested quote stays inside it, an
// earlier separate quote stays out, and an opening mark that never closes widens it.
function quoteEndingAt(line, end) {
  let depth = 1, start = null;
  for (let i = end - 1; i >= 0; i--) {
    if (!'"“”'.includes(line[i])) continue;
    if (!isOpen(line, i)) { depth++; continue; }
    depth--;
    if (start === null && depth === 0) start = i + 1;
    else if (depth < 0) { start = i + 1; depth = 0; }
  }
  return start === null ? null : line.slice(start, end);
}
/** Quotes the seat attributed to a source id, each marked verified or not. */
export function checkQuotes(key, text) {
  const out = [];
  const hay = brainNorm(key);
  for (const line of text.split("\n")) {
    for (const m of line.matchAll(CLOSE_THEN_ID)) {
      if (isOpen(line, m.index)) continue;
      const quote = quoteEndingAt(line, m.index);
      if (quote === null || quote.length < 20 || quote.length > 400) continue;
      const q = norm(quote);
      if (q.split(" ").length < 5) continue;
      out.push({ quote, source: m[1], verified: hay.includes(q) || hay.replace(/ /g, "").includes(q.replace(/ /g, "")) });
    }
  }
  return out;
}

// ---------- card parsing ----------
const field = (text, label) => {
  // label at line start, or after a "·" or "|" when several fields share a line
  const m = text.match(new RegExp(`(?:^|[·|])[ \\t]*\\**${label}\\**[ \\t]*:[ \\t]*([^\\n·]+)`, "im"));
  return m ? m[1].replace(/\*+/g, "").trim() : "";
};
const num = (s) => { const m = (s || "").match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };

export function parseOptionScores(text, optionIds) {
  // the option line itself uses "·" between options, so read to end of line
  const lm = text.match(/OPTION SCORES\**[ \t]*:[ \t]*([^\n]+)/i);
  const line = (lm ? lm[1] : "").split(/PILLAR SCORE|CONFIDENCE|FINAL SCORE/i)[0];
  const scores = {};
  for (const id of optionIds) {
    const m = line.match(new RegExp(`\\b${id}\\b\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)`));
    if (m) scores[id] = Math.max(0, Math.min(10, Number(m[1])));
  }
  return scores;
}

export function parseCard(text, optionIds) {
  const stance = field(text, "STANCE");
  const ruin = (field(text, "RUIN RISK").match(/none|possible|likely/i) || [""])[0].toLowerCase();
  const disagree = field(text, "I DISAGREE MOST WITH");
  const target = SEATS.find((s) => new RegExp(`\\b(${s.short}|${s.name.split(" ").pop()})\\b`, "i").test(disagree.slice(0, 40)));
  const voteRaw = field(text, "VOTE");
  const vote = /dissent/i.test(voteRaw) ? "dissent" : /amend/i.test(voteRaw) ? "amend" : /endorse/i.test(voteRaw) ? "endorse" : "";
  return {
    stance,
    call: field(text, "THE CALL"),
    optionScores: parseOptionScores(text, optionIds),
    pillar: num(field(text, "PILLAR SCORE")) ?? num(field(text, "FINAL PILLAR SCORE")),
    finalScore: num(field(text, "FINAL SCORE")),
    confidence: num(field(text, "CONFIDENCE")),
    ruin,
    door: (field(text, "DOOR").match(/one-way|two-way/i) || [""])[0].toLowerCase(),
    disagreeWith: target ? target.key : null,
    disagreeLine: disagree,
    concede: field(text, "I CONCEDE"),
    moved: field(text, "MOVED"),
    vote,
    amendment: field(text, "AMENDMENT OR DISSENT"),
    oneLine: field(text, "ONE LINE FOR THE FOUNDER"),
    question: field(text, "QUESTION FOR THE FOUNDER"),
    risk: field(text, "THE RISK I SEE"),
    thisWeek: field(text, "WHAT I'D DO THIS WEEK"),
  };
}
