/** Call only in response to an explicit copy or cut action. */
export async function copyText(text: string): Promise<void> {
  try {
    if (typeof globalThis.navigator?.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* Try the browser's legacy copy command within the user action. */
  }

  if (typeof document !== "undefined") {
    const active = document.activeElement as HTMLElement | null;
    const selection = document.getSelection();
    const ranges = selection
      ? Array.from({ length: selection.rangeCount }, (_, index) =>
          selection.getRangeAt(index).cloneRange(),
        )
      : [];
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.setAttribute("aria-hidden", "true");
    Object.assign(input.style, {
      position: "fixed",
      top: "0",
      left: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    document.body.append(input);
    input.select();
    let copied = false;
    try {
      copied =
        typeof document.execCommand === "function" &&
        document.execCommand("copy");
    } catch {
      /* Report the failure below. */
    } finally {
      input.remove();
      active?.focus({ preventScroll: true });
      if (selection) {
        selection.removeAllRanges();
        for (const range of ranges) selection.addRange(range);
      }
    }
    if (copied) return;
  }
  throw new Error(
    "O navegador não permitiu copiar. Selecione o texto e use Ctrl+C (ou ⌘C).",
  );
}

/** Browsers without clipboard read permission must use the native paste shortcut. */
export async function readText(): Promise<string> {
  try {
    if (typeof globalThis.navigator?.clipboard?.readText !== "function")
      throw new Error("unavailable");
    return await navigator.clipboard.readText();
  } catch {
    throw new Error(
      "O navegador não permitiu colar. Use Ctrl+V (ou ⌘V) dentro do editor.",
    );
  }
}
