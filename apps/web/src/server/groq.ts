import 'server-only';
import { env } from './env';

// thin wrapper over groq's OpenAI-compatible endpoint. no sdk — the surface
// we need is small, and one less dep to audit.

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqChatOptions {
  model: string;
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
}

export interface GroqChatResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export async function groqChat(opts: GroqChatOptions): Promise<GroqChatResult> {
  if (!env.groq.apiKey) {
    throw new GroqError('GROQ_API_KEY not set', 500);
  }

  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.groq.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 2000,
      ...(opts.responseFormat === 'json_object' && {
        response_format: { type: 'json_object' },
      }),
    }),
  });

  const latencyMs = Date.now() - started;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GroqError(`groq ${res.status}`, res.status, body);
  }

  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';
  const usage = json.usage ?? {};

  return {
    content,
    model: json.model ?? opts.model,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    latencyMs,
  };
}
