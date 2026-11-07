import { ref, watch, onBeforeUnmount, type Ref } from "vue";
import type { Issue } from "../types";
import type { Settings } from "../services/SettingsService";
import { reviewText } from "../grammar/RuleEngine";

interface WorkerReply {
  id: number;
  issues?: Issue[];
  suggestions?: string[];
  error?: string;
}

export function useProofreader(
  text: Ref<string>,
  settings: Settings,
  personal: Ref<string[]>,
  ignored: Ref<string[]>,
) {
  const issues = ref<Issue[]>([]),
    state = ref<"loading" | "ready" | "disabled" | "error">("loading"),
    error = ref("");
  let worker: Worker | undefined;
  let serial = 0,
    generation = 0,
    timer: ReturnType<typeof setTimeout>;
  const pending = new Map<
    number,
    {
      resolve: (value: WorkerReply) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  const ignoredReviews = new Set<string>();
  function stopWorker(instance: Worker, reason: Error) {
    if (instance !== worker) return;
    instance.terminate();
    worker = undefined;
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(reason);
    }
    pending.clear();
    state.value = settings.spelling ? "error" : "disabled";
    error.value = settings.spelling ? reason.message : "";
  }
  function startWorker(): Worker {
    const instance = new Worker(
      new URL("../spelling/SpellWorker.ts", import.meta.url),
      { type: "module" },
    );
    instance.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      if (instance !== worker) return;
      const request = pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timeout);
      pending.delete(data.id);
      data.error ? request.reject(new Error(data.error)) : request.resolve(data);
    };
    instance.onerror = () => stopWorker(
      instance,
      new Error("Não foi possível iniciar o corretor local. Tente novamente."),
    );
    return instance;
  }
  function request(data: object): Promise<WorkerReply> {
    return new Promise((resolve, reject) => {
      // A failed or timed-out worker is recreated on the next explicit retry.
      const instance = worker ??= startWorker();
      const id = ++serial;
      const timeout = setTimeout(() => {
        stopWorker(
          instance,
          new Error(
            "O dicionário demorou a responder. Verifique sua conexão no primeiro acesso e tente novamente.",
          ),
        );
      }, 60000);
      pending.set(id, { resolve, reject, timeout });
      instance.postMessage({ ...data, id });
    });
  }
  async function check(version: number) {
    const current = text.value;
    const reviews = settings.review
      ? reviewText(current).filter(
          (i) => !ignoredReviews.has(`${i.rule}:${i.text}`),
        )
      : [];
    error.value = "";
    if (!settings.spelling) {
      issues.value = reviews;
      state.value = "disabled";
      return;
    }
    state.value = "loading";
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
      issues.value = [...(result.issues ?? []), ...reviews].sort(
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
    error.value = "";
    state.value = settings.spelling ? "loading" : "disabled";
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
    generation++;
    clearTimeout(timer);
    worker?.terminate();
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
      ).suggestions ?? [],
  };
}
