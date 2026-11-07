/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from "virtual:pwa-register";
import type { Language } from "./types";

/** Keep this version aligned with runtimeCaching in vite.config.ts.
 * Bump it whenever the bundled dictionary data changes. */
export const DICTIONARY_CACHE = "grafelume-dictionaries-v1";

function dictionaryUrls(language: Language): string[] {
  return ["aff", "dic"].map(
    (extension) =>
      new URL(
        `${import.meta.env.BASE_URL}dictionaries/${language}.${extension}`,
        window.location.origin,
      ).href,
  );
}

/** Registration never reloads an in-progress document without a user action. */
export function registerPwa(
  onUpdate: (update: () => Promise<void>) => void,
): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  let acceptedInThisTab = false;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      onUpdate(async () => {
        acceptedInThisTab = true;
        await update(true);
      });
    },
    onNeedReload() {
      // A different tab may have activated the waiting worker. Preserve this
      // tab's unsaved document until its own user accepts the reload as well.
      if (acceptedInThisTab) window.location.reload();
      else
        onUpdate(async () => {
          window.location.reload();
        });
    },
    onRegisterError(error: unknown) {
      // Only registration diagnostics, never document content.
      console.warn(
        "Grafelume: não foi possível registrar o modo offline.",
        error,
      );
    },
  });
}

async function waitForServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!import.meta.env.PROD) {
    throw new Error(
      "O modo offline está disponível na versão de produção (npm run build e npm run preview).",
    );
  }
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("caches" in window)
  ) {
    throw new Error(
      "Este navegador não oferece armazenamento offline neste contexto. Use HTTPS ou localhost.",
    );
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "O modo offline ainda não está pronto. Recarregue a página e tente novamente.",
              ),
            ),
          15_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Explicit user action: store both dictionaries, in addition to the app shell.
 * A language is available offline only when both its data files are present. */
export async function prepareOffline(): Promise<void> {
  await waitForServiceWorker();
  const cache = await caches.open(DICTIONARY_CACHE);
  const urls = (["pt-BR", "en-US"] as const).flatMap(dictionaryUrls);
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok)
        throw new Error(
          `Falha ao baixar ${url.split("/").pop()} (${response.status}).`,
        );
      // Catch static-host HTML fallbacks instead of claiming a bad dictionary is ready.
      const data = await response.clone().text();
      const valid = url.endsWith(".aff")
        ? /^SET\s+/m.test(data)
        : /^\uFEFF?\d+\s*\r?\n/.test(data);
      if (!valid)
        throw new Error(
          "O servidor retornou um dicionário inválido. Verifique o caminho-base da publicação.",
        );
      await cache.put(url, response);
    }),
  );
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed)
    throw failed.reason instanceof Error
      ? failed.reason
      : new Error(
          "Não foi possível armazenar os dicionários. Verifique a conexão e o espaço disponível.",
        );
}

export async function dictionaryOffline(language: Language): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    if (!(await caches.has(DICTIONARY_CACHE))) return false;
    const cache = await caches.open(DICTIONARY_CACHE);
    const files = await Promise.all(
      dictionaryUrls(language).map((url) => cache.match(url)),
    );
    return files.every(Boolean);
  } catch {
    // Storage can be disabled by browser settings or private-mode policies.
    return false;
  }
}
