import type { SupportIntent, Sentiment } from '@app/shared';
import type { AiProvider } from './types.js';

/**
 * Deterministic, dependency-free, keyless fallback. It does NOT understand language — it
 * recognises escalation triggers and hands off (the safe default) and never requests a tool.
 * Also used as the resilient fallback when the OpenAI API errors out.
 */

/** Asks that need a human / a privileged action → escalate (never self-served). */
export const ESCALATE_RX =
  /\b(refund|money\s?back|charge\s?back|replace|replacement|wrong\s+item|damaged|broken|defective|missing|never (arrived|came)|not received|complain|complaint|fraud|scam|cheat|worst|terrible|useless|manager|human|agent|speak to)\b/i;
const ANGRY_RX = /\b(worst|terrible|useless|angry|furious|disgust|hate|pathetic|scam|fraud|cheat|ridiculous)\b/i;
const NEGATIVE_RX = /\b(late|delay|delayed|not working|problem|issue|wrong|damaged|broken|disappointed|bad|slow)\b/i;

export function intentOf(text: string): SupportIntent {
  const t = text.toLowerCase();
  if (/\b(refund|money back|return|replace)\b/.test(t)) return 'return_or_refund';
  if (/\bcancel\b/.test(t)) return 'cancel_order';
  if (/\b(where|track|status|arriv|deliver|shipped|when will)\b/.test(t)) return 'where_is_order';
  if (/\b(pay|payment|charged|refund failed|transaction|upi|card)\b/.test(t)) return 'payment_issue';
  if (/\b(damaged|broken|wrong|missing|defect)\b/.test(t)) return 'order_issue';
  if (/\b(size|colour|color|spec|material|warranty|how (do|to)|does it)\b/.test(t)) return 'product_question';
  if (/\b(account|login|password|profile|address)\b/.test(t)) return 'account';
  return 'general';
}
export function sentimentOf(text: string): Sentiment {
  if (ANGRY_RX.test(text)) return 'angry';
  if (NEGATIVE_RX.test(text)) return 'negative';
  if (/\b(thanks|thank you|great|awesome|love|perfect|good)\b/i.test(text)) return 'positive';
  return 'neutral';
}

export const stubProvider: AiProvider = {
  async chat({ messages }) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    if (ESCALATE_RX.test(lastUser)) return { text: '', toolCalls: [], escalate: true };
    return {
      text:
        "I can help with your orders, deliveries and returns. I'm still learning to answer in " +
        'detail — if this needs a person, just say “talk to support” and I’ll connect you.',
      toolCalls: [],
      escalate: false,
    };
  },
  async embed(texts) {
    // Cheap deterministic pseudo-embedding so retrieval code is exercisable without a key.
    return texts.map((t) => {
      const v = new Array(16).fill(0);
      for (let i = 0; i < t.length; i++) v[i % 16] += t.charCodeAt(i);
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  },
  async classify(text) {
    const escalate = ESCALATE_RX.test(text);
    return {
      intent: intentOf(text),
      sentiment: sentimentOf(text),
      urgency: sentimentOf(text) === 'angry' ? 3 : escalate ? 2 : 1,
      confidence: 0.5, // stub is never confident enough to auto-send (S5 gate)
    };
  },
};
