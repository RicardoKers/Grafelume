import { TRANSLATION_CACHE, translationAssets, type Direction } from './assets';

export interface DownloadProgress { loaded: number; total: number }
function abort(signal: AbortSignal) { signal.throwIfAborted(); }
export async function inspectModel(direction: Direction) {
  const assets = translationAssets(direction);
  if (!globalThis.caches) throw new Error('Este navegador não oferece armazenamento offline para os modelos.');
  const cache = await caches.open(TRANSLATION_CACHE);
  let missingBytes = 0;
  for (const asset of assets) if (!await cache.match(asset.url)) missingBytes += asset.bytes;
  return { available: missingBytes === 0, downloadBytes: missingBytes };
}

export async function prepareModel(direction: Direction, signal: AbortSignal, report: (progress: DownloadProgress) => void) {
  const assets = translationAssets(direction), cache = await caches.open(TRANSLATION_CACHE);
  const pending = [];
  for (const asset of assets) {
    abort(signal);
    if (!await cache.match(asset.url)) pending.push(asset);
  }
  const total = pending.reduce((sum, asset) => sum + asset.bytes, 0);
  let loaded = 0;
  report({ loaded, total });
  for (const asset of pending) {
    abort(signal);
    const url = new URL(asset.url, location.href);
    if (url.origin !== location.origin) throw new Error('Origem de modelo inválida.');
    const response = await fetch(url, { signal, credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok || !response.body) throw new Error('Não foi possível baixar o modelo. Verifique a conexão e tente novamente.');
    const data = new Uint8Array(asset.bytes);
    const reader = response.body.getReader();
    let offset = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        abort(signal);
        if (offset + value.length > data.length) throw new Error('O arquivo do modelo não passou na verificação.');
        data.set(value, offset);
        offset += value.length;
        report({ loaded: loaded + offset, total });
      }
    } finally { reader.releaseLock(); }
    abort(signal);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (offset !== asset.bytes || hash !== asset.sha256) {
      await cache.delete(asset.url);
      throw new Error('O arquivo do modelo não passou na verificação. Tente baixar novamente.');
    }
    abort(signal);
    await cache.put(asset.url, new Response(data, { headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream', 'Content-Length': String(asset.bytes) } }));
    loaded += asset.bytes;
    report({ loaded, total });
  }
}

export async function removeModel(direction: Direction) {
  const cache = await caches.open(TRANSLATION_CACHE);
  for (const asset of translationAssets(direction)) if (asset.url.includes('/models/')) await cache.delete(asset.url);
}
