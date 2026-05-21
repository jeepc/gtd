export type EntryStatus = 'todo' | 'done' | 'log';

/** A metadata value. JSON scalars only (§6.7.4); `null` doubles as a delete sentinel. */
export type ScalarValue = string | number | boolean | null;

/**
 * Entry metadata is an OPEN key-value map (PRD §6.7). Only a handful of base
 * fields are recognized by name; every other key is an arbitrary user field
 * (e.g. `due`, `priority`, `project`) or, when prefixed with `_`, a system
 * field that is hidden in the UI and never sent to AI (§6.7.2 / §8.3).
 */
export interface EntryMetadata {
  /** ISO 8601 last-update time. Always present; drives sync conflict resolution. */
  updated: string;
  /** ISO 8601 completion time (status=done). */
  done?: string;
  /** ISO 8601 log time (status=log). */
  log?: string;
  /** ISO 8601 tombstone time (§6.4.3). */
  deleted?: string;
  /** Arbitrary user / system fields. */
  [key: string]: ScalarValue | undefined;
}

export interface Entry {
  id: string;
  content: string;
  status: EntryStatus;
  tags: string[];
  date: string;
  metadata: EntryMetadata;
}

export interface DayFile {
  date: string;
  version: number;
  updatedAt: string;
  entries: Entry[];
}

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  builtin?: boolean;
}

export interface AppConfig {
  version: 1;
  sync: {
    webdav: {
      url: string;
      username: string;
      passwordRef: string;
    } | null;
    autoSync: boolean;
  };
  ai: {
    enabled: boolean;
    provider: 'anthropic' | 'openai' | 'ollama' | 'custom';
    model: string;
    apiKeyRef: string;
    endpoint: string | null;
    promptTemplates: PromptTemplate[];
  };
  ui: {
    theme: 'auto' | 'light' | 'dark';
    language: 'zh-CN' | 'en-US';
  };
}

export const DATA_FORMAT_VERSION = 1;

export const BUILTIN_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'summary-week',
    name: '总结这周做了什么',
    prompt: '请根据以下条目总结我这周的活动重点、完成情况与未完成事项。\n\n{{entries}}',
    builtin: true,
  },
  {
    id: 'prioritize-todos',
    name: '给未完成 todo 按优先级排序',
    prompt: '请阅读以下未完成 todo，按重要程度排序并解释理由。\n\n{{entries}}',
    builtin: true,
  },
  {
    id: 'time-allocation',
    name: '分析时间分配模式',
    prompt: '请分析以下条目所反映出的时间和精力分配模式，给出洞察。\n\n{{entries}}',
    builtin: true,
  },
];

export function defaultConfig(): AppConfig {
  return {
    version: 1,
    sync: { webdav: null, autoSync: true },
    ai: {
      enabled: false,
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      apiKeyRef: '',
      endpoint: null,
      promptTemplates: BUILTIN_PROMPT_TEMPLATES.slice(),
    },
    ui: { theme: 'auto', language: 'zh-CN' },
  };
}
