import type { SupportIntent, Sentiment } from '@app/shared';

/**
 * AI provider contract. See docs/10-SUPPORT-AI.md §3.
 *
 * ANTI-FRAUD: a provider only ever *asks* to call a tool. Whether a call is allowed, and
 * against whose data, is decided server-side in support/tools/registry.ts from the JWT
 * identity — never from anything the model says. A jailbroken prompt cannot widen a
 * customer's real capabilities.
 */

/** A tool the model may request (JSON-schema params). The registry owns the real guards. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
export interface ChatTurn {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // tool name (role: 'tool')
  toolCallId?: string; // links a tool result to its call
  toolCalls?: ToolCall[]; // assistant's requested calls
}
export interface ChatOpts {
  system?: string;
  messages: ChatTurn[];
  tools?: ToolSpec[];
}
export interface ChatResult {
  /** Final assistant text (empty when the model requested tools instead). */
  text: string;
  /** Tools the model wants to run this turn. Empty = it answered. */
  toolCalls: ToolCall[];
  /** Provider "hand me to a human" signal (stub uses this; OpenAI uses the escalate tool). */
  escalate: boolean;
}
export interface Classification {
  intent: SupportIntent;
  sentiment: Sentiment;
  urgency: 1 | 2 | 3;
  confidence: number; // 0..1 → gates auto-reply (S5)
}
export interface AiProvider {
  chat(opts: ChatOpts): Promise<ChatResult>;
  embed(texts: string[]): Promise<number[][]>;
  classify(text: string): Promise<Classification>;
}
