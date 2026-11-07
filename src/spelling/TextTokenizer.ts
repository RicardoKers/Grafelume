import type { Language } from "../types";

export interface Token {
  from: number;
  to: number;
  text: string;
}

// UTF-16 positions match CodeMirror and String.slice, including astral characters.
const WORD = /[\p{L}\p{M}]+(?:['’‐‑-][\p{L}\p{M}]+)*/gu;
// Unicode boundaries avoid \b splitting identifiers beginning with accented letters.
const TECHNICAL = new RegExp(
  [
    /(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>]+/.source,
    /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u.source,
    /["'](?:[a-zA-Z]:[\\/]|\\\\|\.\.?\/)[^"'\n]+["']/.source,
    /(?:[a-zA-Z]:[\\/]|\\\\|\.{0,2}\/)[^\s<>]+/.source,
    /(?<![\p{L}\p{N}_])(?:[\p{L}\p{N}_.-]+\/)+[\p{L}\p{N}_.-]+/u.source,
    /(?<![\p{L}\p{N}_])[\p{L}\p{N}_.-]+\.(?:txt|md|json|js|ts|vue|tsx|jsx|csv|log|yaml|yml|html|css|pdf|docx|xlsx|png|jpg|svg|zip)(?![\p{L}\p{N}_])/u
      .source,
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/.source,
    /(?<![\p{L}\p{N}_])[\p{L}\p{N}_]*[\p{N}_][\p{L}\p{N}_]*(?![\p{L}\p{N}_])/u
      .source,
    /(?<![\p{L}\p{N}_])[\p{L}]*[\p{Ll}][\p{Lu}][\p{L}]*(?![\p{L}\p{N}_])/u
      .source,
    /(?<![\p{L}\p{N}_])[\p{Lu}]{2,8}(?![\p{L}\p{N}_])/u.source,
  ].join("|"),
  "gu",
);
const UNITS = new Set([
  "kg",
  "mg",
  "km",
  "cm",
  "mm",
  "ml",
  "kHz",
  "MHz",
  "GHz",
  "kW",
  "kWh",
  "MB",
  "GB",
  "TB",
  "Mbps",
  "Gbps",
  "px",
  "Hz",
]);

/** Recognizable technical spans are configurable and never change document text. */
export function technicalRanges(text: string): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  for (const match of text.matchAll(TECHNICAL))
    ranges.push({ from: match.index, to: match.index + match[0].length });
  return ranges.sort((a, b) => a.from - b.from);
}

export function tokenize(
  text: string,
  _language: Language,
  ignoreTechnical = true,
): Token[] {
  const excluded = ignoreTechnical ? technicalRanges(text) : [];
  const tokens: Token[] = [];
  let exclusion = 0;
  for (const match of text.matchAll(WORD)) {
    const from = match.index;
    const to = from + match[0].length;
    while (excluded[exclusion] && excluded[exclusion]!.to <= from) exclusion++;
    if (excluded[exclusion] && excluded[exclusion]!.from < to) continue;
    if (ignoreTechnical && UNITS.has(match[0])) continue;
    tokens.push({ from, to, text: match[0] });
  }
  return tokens;
}
