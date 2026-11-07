import { ref, watch, onBeforeUnmount, type Ref } from "vue";
import type { Issue } from "../types";
import type { Settings } from "../services/SettingsService";
import { reviewText } from "../grammar/RuleEngine";

export function useProofreader(
  text: Ref<string>,
  settings: Settings,
  personal: Ref<string[]>,
  ignored: Ref<string[]>,
) {
  const issues = ref<Issue[]>([]),
    state = ref<"loading" | "ready" | "disabled" | "error">("loading"),
    error = ref("");
  const worker = new Worker(
    new URL("../spelling/SpellWorker.ts", import.meta.url),
    { type: "module" },
  );
  let serial = 0,
    generation = 0,
    timer: ReturnType<typeof setTimeout>;
  const pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  const ignoredReviews = new Set<string>();
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(data.id);
    data.error ? request.reject(new Error(data.error)) : request.resolve(data);
  };
  worker.onerror = () => {
    for (const req of pending.values()) {
      clearTimeout(req.timeout);
      req.reject(
        new Error(
          "Não foi possível iniciar o corretor local. Recarregue a página.",
        ),
      );
    }
    pending.clear();
    state.value = "error";
    error.value = "Falha no corretor local. Tente novamente.";
  };
  function request(data: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            "O dicionário demorou a responder. Verifique sua conexão no primeiro acesso e tente novamente.",
          ),
        );
      }, 60000);
      pending.set(id, { resolve, reject, timeout });
      worker.postMessage({ ...data, id });
    });
  }
  async function check(version: number) {
    const current = text.value;
    const reviews = settings.review
      ? reviewText(current).filter(
          (i) => !ignoredReviews.has(`${i.rule}:${i.text}`),
        )
      : [];
    if (!settings.spelling) {
      issues.value = reviews;
      state.value = "disabled";
      return;
    }
    state.value = "loading";
    error.value = "";
    try {
      const result = await request({
        type: "check",
        language: settings.language,
        text: current,
        personal: [...personal.value],
        ignored: [...ignored.value],
        ignoreTechnical: settings.ignoreTechnical,
      });
      if (version !== generation) return;
      issues.value = [...result.issues, ...reviews].sort(
        (a, b) => a.from - b.from || a.to - b.to,
      );
      state.value = "ready";
    } catch (e) {
      if (version !== generation) return;
      issues.value = reviews;
      state.value = "error";
      error.value = (e as Error).message;
    }
  }
  function schedule() {
    generation++;
    clearTimeout(timer);
    // Immediately discard obsolete ranges; document decorations map themselves until this update.
    issues.value = [];
    const version = generation;
    timer = setTimeout(() => void check(version), 260);
  }
  watch(
    [
      text,
      () => settings.language,
      () => settings.spelling,
      () => settings.review,
      () => settings.ignoreTechnical,
      personal,
      ignored,
    ],
    schedule,
    { immediate: true, deep: true },
  );
  onBeforeUnmount(() => {
    clearTimeout(timer);
    worker.terminate();
    for (const r of pending.values()) clearTimeout(r.timeout);
  });
  return {
    issues,
    state,
    error,
    retry: schedule,
    ignoreReview: (issue: Issue) => {
      ignoredReviews.add(`${issue.rule}:${issue.text}`);
      schedule();
    },
    suggestions: async (word: string) =>
      (
        await request({
          type: "suggest",
          language: settings.language,
          word,
          limit: settings.suggestions,
        })
      ).suggestions as string[],
  };
}
