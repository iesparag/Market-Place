import { z } from 'zod';
import { SupportIntentEnum, SentimentEnum } from '@app/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { AiProvider, ChatOpts, ChatResult, ChatTurn, Classification, ToolCall } from './types.js';
import { stubProvider } from './stub.js';

/**
 * OpenAI provider over the raw REST API via native fetch — no SDK dependency. On ANY network
 * or parse error we fall back to the deterministic stub so support never hard-fails on a flaky
 * key/quota. The tool guards live in the registry, so a degraded LLM can never over-reach.
 */
const OPENAI_URL = 'https://api.openai.com/v1';

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${OPENAI_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${path} → ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

// ── OpenAI wire types (only the fields we read) ──────────────────────────────
interface OAIToolCall {
  id: string;
  function: { name: string; arguments: string };
}
interface OAIMessage {
  content: string | null;
  tool_calls?: OAIToolCall[];
}
interface OAIChatResponse {
  choices: { message: OAIMessage }[];
}
interface OAIEmbedResponse {
  data: { embedding: number[] }[];
}

function toOpenAiMessages(system: string | undefined, messages: ChatTurn[]): unknown[] {
  const out: unknown[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        })),
      });
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function parseToolCalls(tcs: OAIToolCall[] | undefined): ToolCall[] {
  if (!tcs?.length) return [];
  return tcs.map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || '{}');
    } catch {
      args = {};
    }
    return { id: tc.id, name: tc.function.name, args };
  });
}

const ClassifySchema = z.object({
  intent: SupportIntentEnum,
  sentiment: SentimentEnum,
  urgency: z.coerce.number().int().min(1).max(3),
  confidence: z.coerce.number().min(0).max(1),
});

export const openaiProvider: AiProvider = {
  async chat(opts: ChatOpts): Promise<ChatResult> {
    try {
      const body: Record<string, unknown> = {
        model: env.AI_CHAT_MODEL,
        temperature: 0.2,
        messages: toOpenAiMessages(opts.system, opts.messages),
      };
      if (opts.tools?.length) {
        body.tools = opts.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        body.tool_choice = 'auto';
      }
      const data = (await post('/chat/completions', body)) as OAIChatResponse;
      const msg = data.choices?.[0]?.message;
      const toolCalls = parseToolCalls(msg?.tool_calls);
      return { text: msg?.content ?? '', toolCalls, escalate: false };
    } catch (err) {
      logger.warn({ err: String(err) }, '[ai] openai.chat failed — falling back to stub');
      return stubProvider.chat(opts);
    }
  },

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    try {
      const data = (await post('/embeddings', { model: env.AI_EMBED_MODEL, input: texts })) as OAIEmbedResponse;
      return data.data.map((d) => d.embedding);
    } catch (err) {
      logger.warn({ err: String(err) }, '[ai] openai.embed failed — falling back to stub');
      return stubProvider.embed(texts);
    }
  },

  async classify(text: string): Promise<Classification> {
    try {
      const data = (await post('/chat/completions', {
        model: env.AI_CHAT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Classify the customer support message. Reply with ONLY a JSON object: ' +
              '{"intent": one of ["where_is_order","return_or_refund","cancel_order","order_issue","payment_issue","product_question","account","general","other"], ' +
              '"sentiment": one of ["positive","neutral","negative","angry"], ' +
              '"urgency": 1|2|3, "confidence": 0..1}. No prose.',
          },
          { role: 'user', content: text.slice(0, 4000) },
        ],
      })) as OAIChatResponse;
      const raw = data.choices?.[0]?.message?.content ?? '{}';
      const parsed = ClassifySchema.parse(JSON.parse(raw));
      return {
        intent: parsed.intent,
        sentiment: parsed.sentiment,
        urgency: parsed.urgency as 1 | 2 | 3,
        confidence: parsed.confidence,
      };
    } catch (err) {
      logger.warn({ err: String(err) }, '[ai] openai.classify failed — falling back to stub');
      return stubProvider.classify(text);
    }
  },
};
