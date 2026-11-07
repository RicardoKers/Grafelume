export interface TranslationSegment {
  text: string;
  translate: boolean;
}

/** Keep sentence boundaries and the original layout separate from model input. */
export function translationSegments(
  text: string,
  language: "pt-BR" | "en-US",
): TranslationSegment[] {
  const result: TranslationSegment[] = [];
  const segmenter = new Intl.Segmenter(language, { granularity: "sentence" });

  function append(value: string, translate: boolean): void {
    if (!value) return;
    const previous = result.at(-1);
    if (!translate && previous && !previous.translate) {
      previous.text += value;
    } else {
      result.push({ text: value, translate });
    }
  }

  // Line breaks remain literal even when a sentence has no terminal punctuation.
  for (const line of text.split(/(\r\n|[\r\n\u2028\u2029])/u)) {
    if (/^[\r\n\u2028\u2029]+$/u.test(line)) {
      append(line, false);
      continue;
    }
    for (const { segment } of segmenter.segment(line)) {
      const start = segment.search(/\S/u);
      if (start < 0) {
        append(segment, false);
        continue;
      }
      const end = segment.length - (segment.match(/\s*$/u)?.[0].length ?? 0);
      const sentence = segment.slice(start, end);
      append(segment.slice(0, start), false);
      append(sentence, /[\p{L}\p{N}]/u.test(sentence));
      append(segment.slice(end), false);
    }
  }
  return result;
}

/** Split without deleting whitespace or cutting a UTF-16 surrogate pair. */
export function splitForTokens(
  text: string,
  count: (text: string) => number,
  maxTokens = 380,
): string[] {
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) {
    throw new RangeError("O limite de tokens deve ser um inteiro positivo.");
  }
  if (!text) return [];

  function fits(value: string): boolean {
    const tokens = count(value);
    if (!Number.isSafeInteger(tokens) || tokens < 0) {
      throw new RangeError("A contagem de tokens deve ser um inteiro não negativo.");
    }
    return tokens <= maxTokens;
  }

  if (fits(text)) return [text];
  const result: string[] = [];
  let current = "";
  const words = new Intl.Segmenter(undefined, { granularity: "word" });

  for (const { segment } of words.segment(text)) {
    if (fits(current + segment)) {
      current += segment;
      continue;
    }
    if (current) {
      result.push(current);
      current = "";
    }
    if (fits(segment)) {
      current = segment;
      continue;
    }

    // A long word can exceed the model limit; iterate Unicode code points.
    for (const character of segment) {
      if (fits(current + character)) {
        current += character;
        continue;
      }
      if (current) {
        result.push(current);
        current = "";
      }
      if (!fits(character)) {
        throw new RangeError("Um único caractere excede o limite de tokens.");
      }
      current = character;
    }
  }
  if (current) result.push(current);
  return result;
}
