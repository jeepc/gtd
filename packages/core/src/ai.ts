import type { Entry, PromptTemplate } from './types.js';
import { serializeEntryForAI } from './serializer.js';

export interface AIRequest {
  provider: 'anthropic' | 'openai' | 'ollama' | 'custom';
  apiKey: string;
  model: string;
  endpoint?: string | null;
  systemPrompt?: string;
  userPrompt: string;
}

export interface AIChunk {
  delta: string;
  done: boolean;
}

export interface AIClient {
  /** Returns an async iterator of streamed deltas. */
  stream(req: AIRequest, signal?: AbortSignal): AsyncIterable<AIChunk>;
}

export function renderTemplate(template: PromptTemplate, entries: Entry[]): string {
  // `_`-prefixed system fields are never sent to AI (§8.3).
  const rendered = entries.map(serializeEntryForAI).join('\n');
  return template.prompt.replace(/\{\{entries\}\}/g, rendered);
}

/** Anthropic Messages API streaming client. Lazy-initialized fetch — no SDK dependency. */
export class FetchAIClient implements AIClient {
  constructor(private fetchFn: typeof fetch = fetch) {}

  async *stream(req: AIRequest, signal?: AbortSignal): AsyncIterable<AIChunk> {
    switch (req.provider) {
      case 'anthropic':
        yield* this.streamAnthropic(req, signal);
        break;
      case 'openai':
        yield* this.streamOpenAI(req, signal);
        break;
      case 'ollama':
        yield* this.streamOllama(req, signal);
        break;
      case 'custom':
        yield* this.streamOpenAI(req, signal); // assume OpenAI-compat
        break;
    }
  }

  private async *streamAnthropic(req: AIRequest, signal?: AbortSignal): AsyncIterable<AIChunk> {
    const url = req.endpoint || 'https://api.anthropic.com/v1/messages';
    const body = {
      model: req.model,
      max_tokens: 2048,
      stream: true,
      system: req.systemPrompt,
      messages: [{ role: 'user', content: req.userPrompt }],
    };
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal,
    });
    yield* parseSSE(res, (json) => {
      const data = JSON.parse(json);
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        return data.delta.text as string;
      }
      return null;
    });
  }

  private async *streamOpenAI(req: AIRequest, signal?: AbortSignal): AsyncIterable<AIChunk> {
    const url = req.endpoint || 'https://api.openai.com/v1/chat/completions';
    const messages: Array<{ role: string; content: string }> = [];
    if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });
    messages.push({ role: 'user', content: req.userPrompt });
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify({ model: req.model, stream: true, messages }),
      signal,
    });
    yield* parseSSE(res, (json) => {
      if (json === '[DONE]') return null;
      const data = JSON.parse(json);
      return data.choices?.[0]?.delta?.content ?? null;
    });
  }

  private async *streamOllama(req: AIRequest, signal?: AbortSignal): AsyncIterable<AIChunk> {
    const url = req.endpoint || 'http://localhost:11434/api/chat';
    const messages: Array<{ role: string; content: string }> = [];
    if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });
    messages.push({ role: 'user', content: req.userPrompt });
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: req.model, stream: true, messages }),
      signal,
    });
    // Ollama returns newline-delimited JSON.
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop()!;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.message?.content) yield { delta: data.message.content, done: false };
          if (data.done) yield { delta: '', done: true };
        } catch {
          // ignore
        }
      }
    }
  }
}

async function* parseSSE(
  res: Response,
  extractDelta: (json: string) => string | null,
): AsyncIterable<AIChunk> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop()!;
    for (const ev of events) {
      for (const rawLine of ev.split('\n')) {
        if (!rawLine.startsWith('data:')) continue;
        const data = rawLine.slice(5).trim();
        if (!data) continue;
        try {
          const delta = extractDelta(data);
          if (delta) yield { delta, done: false };
        } catch {
          // skip malformed
        }
      }
    }
  }
  yield { delta: '', done: true };
}
