import type { Language } from '../types';
export type TranslationPhase = 'idle' | 'downloading' | 'loading' | 'translating' | 'ready' | 'error';
export interface TranslationProgress { loaded: number; total: number; completed: number; segments: number }
export interface TranslationRequest { text: string; language: Language; base: string }
export type TranslationResponse = { type: 'progress'; completed: number; segments: number } | { type: 'result'; text: string } | { type: 'error'; message: string };
