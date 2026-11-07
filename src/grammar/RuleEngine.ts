import type { Issue } from "../types";

/** Small, deterministic typography checks. All ranges are UTF-16 editor offsets. */
export function reviewText(text: string): Issue[] {
  const issues: Issue[] = [];
  // Technical fragments are opaque to prose rules, including punctuation in them.
  const protectedRanges = [
    ...text.matchAll(
      /`[^`\n]*`|(?:https?:\/\/|www\.)[^\s<>]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?:[A-Za-z]:[\\/]|\.{0,2}\/)[^\s<>]+|\b\w+[_.]\w+(?:[_.]\w+)*\b/gu,
    ),
  ].map((match) => ({
    from: match.index!,
    to: match.index! + match[0].length,
  }));
  const protectedAt = (from: number, to: number) =>
    protectedRanges.some((range) => from < range.to && to > range.from);
  const add = (
    rule: string,
    from: number,
    to: number,
    message: string,
    suggestion: string,
  ) => {
    if (
      protectedAt(from, to) ||
      issues.some((issue) => from < issue.to && to > issue.from)
    )
      return;
    issues.push({
      id: `${rule}:${from}:${to}`,
      from,
      to,
      text: text.slice(from, to),
      category: "review",
      message,
      suggestions: [suggestion],
      rule,
    });
  };

  const words = [...text.matchAll(/[\p{L}][\p{L}\p{M}'’\-]*/gu)];
  for (let index = 1; index < words.length; index++) {
    const previous = words[index - 1]!;
    const current = words[index]!;
    const from = previous.index!;
    const gap = text.slice(from + previous[0].length, current.index!);
    if (
      /^[ \t]+$/.test(gap) &&
      previous[0].normalize("NFC").toLocaleLowerCase() ===
        current[0].normalize("NFC").toLocaleLowerCase()
    ) {
      add(
        "repeated-word",
        from,
        current.index! + current[0].length,
        "Possível repetição de palavra.",
        previous[0],
      );
    }
  }

  // Check trailing whitespace before duplicate spaces to avoid overlapping fixes.
  for (const match of text.matchAll(/[ \t]+(?=\r?$)/gm)) {
    add(
      "trailing-space",
      match.index!,
      match.index! + match[0].length,
      "Espaço no fim da linha.",
      "",
    );
  }
  for (const match of text.matchAll(/[ \t]+(?=[,.;:!?])/g)) {
    add(
      "space-before-punctuation",
      match.index!,
      match.index! + match[0].length,
      "Remova o espaço antes da pontuação.",
      "",
    );
  }
  for (const match of text.matchAll(/[ \t]{2,}/g)) {
    const lineStart = text.lastIndexOf("\n", match.index! - 1) + 1;
    if (text.slice(lineStart, match.index!).trim() === "") continue; // Keep intentional indentation.
    add(
      "duplicate-space",
      match.index!,
      match.index! + match[0].length,
      "Espaços consecutivos.",
      " ",
    );
  }
  for (const match of text.matchAll(/(?:\r?\n){3,}/g)) {
    const newline = match[0].includes("\r\n") ? "\r\n" : "\n";
    add(
      "excessive-newlines",
      match.index!,
      match.index! + match[0].length,
      "Quebras de linha excessivas.",
      newline.repeat(2),
    );
  }
  // Preserve ellipses, expressive !!/?? and combinations such as ?!.
  for (const match of text.matchAll(/([,;:])\1+|(?<!\.)\.{2}(?!\.)/g)) {
    add(
      "duplicate-punctuation",
      match.index!,
      match.index! + match[0].length,
      "Pontuação aparentemente duplicada.",
      match[0][0]!,
    );
  }
  // A period followed by a letter can be an abbreviation or domain. Deliberately
  // leave that ambiguous case alone; commas and sentence-ending !/? are safer.
  for (const match of text.matchAll(
    /(?<=[\p{L}\p{M}])([,;:!?])(?=[\p{L}])/gu,
  )) {
    const from = match.index!;
    add(
      "missing-space",
      from,
      from + match[0].length,
      "Insira um espaço após a pontuação.",
      `${match[0]} `,
    );
  }
  return issues.sort((a, b) => a.from - b.from || a.to - b.to);
}
