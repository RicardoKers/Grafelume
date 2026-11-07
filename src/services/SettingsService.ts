import type { Language } from "../types";

export interface Settings {
  language: Language;
  theme: "system" | "light" | "dark";
  fontFamily: "sans" | "serif" | "mono";
  fontSize: number;
  maxWidth: number;
  lineHeight: number;
  spelling: boolean;
  review: boolean;
  suggestions: number;
  ignoreTechnical: boolean;
  confirmClear: boolean;
  showCounts: boolean;
  showReview: boolean;
  restorePreferences: boolean;
}

export const defaultSettings: Settings = {
  language: "pt-BR",
  theme: "system",
  fontFamily: "sans",
  fontSize: 18,
  maxWidth: 840,
  lineHeight: 1.8,
  spelling: true,
  review: true,
  suggestions: 5,
  ignoreTechnical: true,
  confirmClear: true,
  showCounts: true,
  showReview: true,
  restorePreferences: true,
};

const SETTINGS_KEY = "grafelume:settings:v1";
const personalKey = (language: Language) => `grafelume:personal:${language}:v1`;

function read(key: string): unknown {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function validate(value: unknown): Settings {
  const result = { ...defaultSettings };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  const data = value as Record<string, unknown>;
  for (const key of [
    "spelling",
    "review",
    "ignoreTechnical",
    "confirmClear",
    "showCounts",
    "showReview",
    "restorePreferences",
  ] as const) {
    if (typeof data[key] === "boolean") result[key] = data[key];
  }
  if (data.language === "pt-BR" || data.language === "en-US")
    result.language = data.language;
  if (
    data.theme === "system" ||
    data.theme === "light" ||
    data.theme === "dark"
  )
    result.theme = data.theme;
  if (
    data.fontFamily === "sans" ||
    data.fontFamily === "serif" ||
    data.fontFamily === "mono"
  )
    result.fontFamily = data.fontFamily;
  for (const [key, min, max, integer] of [
    ["fontSize", 12, 36, true],
    ["maxWidth", 480, 1600, true],
    ["lineHeight", 1.2, 2.4, false],
    ["suggestions", 1, 5, true],
  ] as const) {
    const candidate = data[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const bounded = Math.min(max, Math.max(min, candidate));
      result[key] = integer ? Math.round(bounded) : bounded;
    }
  }
  return result;
}

export function loadSettings(): Settings {
  const settings = validate(read(SETTINGS_KEY));
  return settings.restorePreferences
    ? settings
    : { ...defaultSettings, restorePreferences: false };
}

/** Only an explicit allowlist of preferences is persisted; never the document. */
export function saveSettings(settings: Settings): boolean {
  return write(SETTINGS_KEY, validate(settings));
}

function validateWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((word): word is string => typeof word === "string")
        .map((word) => word.trim().normalize("NFC"))
        .filter(
          (word) =>
            word.length <= 100 &&
            /^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u.test(word),
        ),
    ),
  ]
    .slice(0, 10000)
    .sort((a, b) => a.localeCompare(b));
}

export function loadPersonal(language: Language): string[] {
  return validateWords(read(personalKey(language)));
}

export function savePersonal(language: Language, words: string[]): boolean {
  return write(personalKey(language), validateWords(words));
}
