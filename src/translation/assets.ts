import models from './models.json';
import runtime from './runtime.json';
import type { Language } from '../types';

export const TRANSLATION_CACHE = 'grafelume-translation-v1';
export type Direction = 'pt-en' | 'en-pt';
export interface Asset { url: string; bytes: number; sha256: string }
export const directionFor = (language: Language): Direction => language === 'pt-BR' ? 'pt-en' : 'en-pt';
export const targetFor = (language: Language): Language => language === 'pt-BR' ? 'en-US' : 'pt-BR';
export function translationAssets(direction: Direction, base = import.meta.env.BASE_URL): Asset[] {
  const model = models.find(item => item.id === direction)!;
  return [
    ...runtime.files.map(file => ({ ...file, url: `${base}translation/engine/${file.path}` })),
    ...model.files.map(file => ({ ...file, url: `${base}translation/models/${direction}/${file.path}` })),
  ];
}
