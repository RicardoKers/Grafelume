/// <reference lib="webworker" />
import { TRANSLATION_CACHE, directionFor, translationAssets } from './assets';
import { translationSegments, splitForTokens } from './segments';
import type { TranslationRequest, TranslationResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
function send(message: TranslationResponse) { scope.postMessage(message); }
scope.onmessage = async ({ data }: MessageEvent<TranslationRequest>) => {
  try {
    const direction = directionFor(data.language), base = new URL(data.base, scope.location.origin);
    if (base.origin !== scope.location.origin) throw new Error('Origem inválida.');
    const allowed = new Set(translationAssets(direction, base.pathname).map(asset => new URL(asset.url, base).href));
    const cache = await caches.open(TRANSLATION_CACHE);
    // Inference reads only prepared local assets. Missing optional configs return 404,
    // never a remote fallback. User text is only passed to in-memory tensors.
    const cachedFetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : String(input), base);
      if (!allowed.has(url.href)) return new Response(null, { status: 404 });
      return await cache.match(url) || new Response(null, { status: 404 });
    };
    scope.fetch = cachedFetch;
    const vendorUrl = new URL('translation/engine/transformers.min.js', base).href;
    const library = await import(/* @vite-ignore */ vendorUrl);
    const { env, AutoTokenizer, AutoModelForSeq2SeqLM, Tensor } = library;
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = `${base.pathname}translation/models/`;
    env.useBrowserCache = false;
    env.useFSCache = false;
    env.useWasmCache = false;
    env.fetch = cachedFetch;
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.wasmPaths = {
      mjs: new URL('translation/engine/ort-wasm-simd-threaded.mjs', base).href,
      wasm: new URL('translation/engine/ort-wasm-simd-threaded.wasm', base).href,
    };
    const tokenizer = await AutoTokenizer.from_pretrained(direction, { local_files_only: true });
    const model = await AutoModelForSeq2SeqLM.from_pretrained(direction, { local_files_only: true, dtype: 'q8', device: 'wasm' });
    const segments = translationSegments(data.text, data.language).flatMap(segment => segment.translate
      ? splitForTokens(segment.text, text => tokenizer.encode(text).length + (direction === 'en-pt' ? 1 : 0), 380).map(text => ({ text, translate: true }))
      : [segment]);
    const total = segments.filter(segment => segment.translate).length;
    let completed = 0, result = '';
    send({ type: 'progress', completed, segments: total });
    for (const segment of segments) {
      if (!segment.translate) { result += segment.text; continue; }
      const leading = segment.text.match(/^\s*/u)![0], trailing = segment.text.match(/\s*$/u)![0];
      const ids: number[] = tokenizer.encode(segment.text.trim());
      // Marian's multilingual target token must be a single ID. Encoding its string
      // with Transformers.js 4.3.2 splits it incorrectly (verified against vocab).
      if (direction === 'en-pt') ids.unshift(51);
      const output = await model.generate({
        input_ids: new Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
        attention_mask: new Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]),
        max_new_tokens: 512, num_beams: 1, do_sample: false,
      });
      const tokens = Array.from(output.data as BigInt64Array);
      if (tokens.length >= 513 || !tokens.includes(0n)) throw new Error('Uma frase excedeu o limite de tradução. Divida-a em frases menores e tente novamente.');
      const translated: string = tokenizer.batch_decode(output, { skip_special_tokens: true })[0]?.trim();
      if (!translated) throw new Error('Não foi possível traduzir uma das frases. Tente usar frases menores.');
      result += leading + translated + trailing;
      send({ type: 'progress', completed: ++completed, segments: total });
    }
    send({ type: 'result', text: result });
  } catch (error) {
    const message = error instanceof Error && (error.message.startsWith('Uma frase') || error.message.startsWith('Não foi possível traduzir'))
      ? error.message : 'Não foi possível executar o modelo local. Feche outras abas para liberar memória e tente novamente. Se persistir, remova e baixe o modelo outra vez.';
    send({ type: 'error', message });
  }
};
