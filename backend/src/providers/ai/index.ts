import { env } from '../../config/env.js';
import type { AiProvider } from './types.js';
import { stubProvider } from './stub.js';
import { openaiProvider } from './openai.js';

/**
 * Swappable AI layer — same pattern as providers/email + modules/search.
 *   - OPENAI_API_KEY set → openaiProvider (real LLM + tool-calling, stub fallback on error).
 *   - unset             → stubProvider (deterministic, keyless; support still works in dev).
 * See docs/10-SUPPORT-AI.md §3.
 */
export * from './types.js';
export { stubProvider, ESCALATE_RX, intentOf, sentimentOf } from './stub.js';
export { openaiProvider } from './openai.js';

export const aiProvider: AiProvider = env.OPENAI_API_KEY ? openaiProvider : stubProvider;
