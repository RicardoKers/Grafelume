import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultSettings,
  loadPersonal,
  loadSettings,
  savePersonal,
  saveSettings,
} from "../../src/services/SettingsService";

describe("local preferences and personal dictionary", () => {
  const storage = new Map<string, string>();
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns independent defaults when nothing has been saved", () => {
    const loaded = loadSettings();
    expect(loaded).toEqual(defaultSettings);
    loaded.fontSize = 30;
    expect(loadSettings().fontSize).toBe(defaultSettings.fontSize);
  });
  it("persists the allowed preferences and never extra document fields", () => {
    expect(
      saveSettings({
        ...defaultSettings,
        theme: "dark",
        language: "en-US",
        text: "private document",
      } as typeof defaultSettings),
    ).toBe(true);
    expect(loadSettings()).toMatchObject({ theme: "dark", language: "en-US" });
    expect([...storage.values()].join("")).not.toContain("private document");
  });
  it("validates and bounds untrusted persisted data", () => {
    storage.set(
      "grafelume:settings:v1",
      JSON.stringify({
        theme: "unknown",
        fontSize: 999,
        suggestions: -2,
        spelling: "yes",
        lineHeight: 0,
      }),
    );
    expect(loadSettings()).toMatchObject({
      theme: "system",
      fontSize: 36,
      suggestions: 1,
      spelling: true,
      lineHeight: 1.2,
    });
  });
  it("recovers from corrupt storage and denied access", () => {
    storage.set("grafelume:settings:v1", "{");
    expect(loadSettings()).toEqual(defaultSettings);
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    });
    expect(loadSettings()).toEqual(defaultSettings);
    expect(saveSettings(defaultSettings)).toBe(false);
    expect(savePersonal("pt-BR", ["Grafelume"])).toBe(false);
  });
  it("respects the preference restoration toggle", () => {
    saveSettings({
      ...defaultSettings,
      theme: "dark",
      restorePreferences: false,
    });
    expect(loadSettings()).toEqual({
      ...defaultSettings,
      restorePreferences: false,
    });
  });
  it("stores personal words separately by language and supports removal", () => {
    savePersonal("pt-BR", [
      "Grafelume",
      "Grafelume",
      " ação ",
      "ac\u0327a\u0303o",
      "inválida palavra",
      "",
    ]);
    savePersonal("en-US", ["Codex"]);
    expect(loadPersonal("pt-BR")).toEqual(["ação", "Grafelume"]);
    expect(loadPersonal("en-US")).toEqual(["Codex"]);
    savePersonal("pt-BR", ["Grafelume"]);
    expect(loadPersonal("pt-BR")).toEqual(["Grafelume"]);
  });
});
