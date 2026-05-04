/**
 * OpenCode Zen/Go Provider Extension
 *
 * Gives pi access to OpenCode Zen (cash balance) and Go (subscription credits) models.
 *
 * Setup:
 *   1. Subscribe at https://opencode.ai/auth and get your API key
 *   2. Set the env var: export OPENCODE_API_KEY="your-key-here"
 *   3. Use /model in pi to select a model
 *
 * Four providers, because each source has two different API types:
 *   - opencode-zen           : OpenAI Chat Completions (https://opencode.ai/zen/v1)
 *   - opencode-zen-anthropic : Anthropic Messages       (https://opencode.ai/zen)
 *   - opencode-go            : OpenAI Chat Completions (https://opencode.ai/zen/go/v1)
 *   - opencode-go-anthropic  : Anthropic Messages       (https://opencode.ai/zen/go)
 *
 * Docs: https://opencode.ai/docs/zen/ | https://opencode.ai/docs/go/
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

type Modality = 'text' | 'image';
interface ModelDef {
  id: string;
  name: string;
  reasoning: boolean;
  input: readonly Modality[];
  contextWindow: number;
  maxTokens: number;
}

const OAI_COMPAT = {
  maxTokensField: 'max_tokens' as const,
  supportsDeveloperRole: false,
  supportsReasoningEffort: false
};

function toOpenAIModel(m: ModelDef) {
  return {
    compat: OAI_COMPAT,
    contextWindow: m.contextWindow,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    id: m.id,
    input: [...m.input] as Modality[],
    maxTokens: m.maxTokens,
    name: m.name,
    reasoning: m.reasoning
  };
}

function toAnthropicModel(m: ModelDef) {
  return {
    contextWindow: m.contextWindow,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    id: m.id,
    input: [...m.input] as Modality[],
    maxTokens: m.maxTokens,
    name: m.name,
    reasoning: m.reasoning
  };
}

// ───────── OpenCode Zen ─────────

// OpenAI Chat Completions compatible models (GPT / Gemini / Qwen / GLM / Kimi / etc.)
const ZEN_OPENAI_MODELS: ModelDef[] = [
  // GPT
  {
    contextWindow: 200000,
    id: 'gpt-5.4',
    input: ['text'],
    maxTokens: 32000,
    name: 'GPT 5.4',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gpt-5.4-pro',
    input: ['text'],
    maxTokens: 32000,
    name: 'GPT 5.4 Pro',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gpt-5.4-mini',
    input: ['text'],
    maxTokens: 32000,
    name: 'GPT 5.4 Mini',
    reasoning: true
  },
  {
    contextWindow: 128000,
    id: 'gpt-5.4-nano',
    input: ['text'],
    maxTokens: 16384,
    name: 'GPT 5.4 Nano',
    reasoning: false
  },
  {
    contextWindow: 200000,
    id: 'gpt-5.3-codex',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'GPT 5.3 Codex',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gpt-5.3-codex-spark',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'GPT 5.3 Codex Spark',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gpt-5.2',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'GPT 5.2',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gpt-5.2-codex',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'GPT 5.2 Codex',
    reasoning: true
  },
  {
    contextWindow: 128000,
    id: 'gpt-5.1',
    input: ['text', 'image'],
    maxTokens: 16384,
    name: 'GPT 5.1',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gpt-5.1-codex-max',
    input: ['text', 'image'],
    maxTokens: 64000,
    name: 'GPT 5.1 Codex Max',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gpt-5.1-codex',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'GPT 5.1 Codex',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gpt-5.1-codex-mini',
    input: ['text', 'image'],
    maxTokens: 16384,
    name: 'GPT 5.1 Codex Mini',
    reasoning: true
  },
  {
    contextWindow: 128000,
    id: 'gpt-5',
    input: ['text', 'image'],
    maxTokens: 16384,
    name: 'GPT 5',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gpt-5-codex',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'GPT 5 Codex',
    reasoning: true
  },
  {
    contextWindow: 128000,
    id: 'gpt-5-nano',
    input: ['text'],
    maxTokens: 16384,
    name: 'GPT 5 Nano',
    reasoning: false
  },

  // Gemini
  {
    contextWindow: 200000,
    id: 'gemini-3.1-pro',
    input: ['text', 'image'],
    maxTokens: 32768,
    name: 'Gemini 3.1 Pro',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'gemini-3-pro',
    input: ['text', 'image'],
    maxTokens: 32768,
    name: 'Gemini 3 Pro',
    reasoning: true
  },
  {
    contextWindow: 128000,
    id: 'gemini-3-flash',
    input: ['text', 'image'],
    maxTokens: 16384,
    name: 'Gemini 3 Flash',
    reasoning: true
  },

  // Open models via chat completions
  {
    contextWindow: 1000000,
    id: 'qwen3.6-plus',
    input: ['text'],
    maxTokens: 65536,
    name: 'Qwen 3.6 Plus',
    reasoning: false
  },
  {
    contextWindow: 1000000,
    id: 'qwen3.5-plus',
    input: ['text'],
    maxTokens: 65536,
    name: 'Qwen 3.5 Plus',
    reasoning: false
  },
  {
    contextWindow: 128000,
    id: 'minimax-m2.5-free',
    input: ['text'],
    maxTokens: 16384,
    name: 'MiniMax M2.5 Free',
    reasoning: false
  },
  {
    contextWindow: 128000,
    id: 'glm-5.1',
    input: ['text'],
    maxTokens: 16384,
    name: 'GLM 5.1',
    reasoning: true
  },
  {
    contextWindow: 128000,
    id: 'glm-5',
    input: ['text'],
    maxTokens: 16384,
    name: 'GLM 5',
    reasoning: true
  },
  {
    contextWindow: 128000,
    id: 'glm-4.7',
    input: ['text'],
    maxTokens: 16384,
    name: 'GLM 4.7',
    reasoning: true
  },
  {
    contextWindow: 128000,
    id: 'glm-4.6',
    input: ['text'],
    maxTokens: 16384,
    name: 'GLM 4.6',
    reasoning: true
  },
  {
    contextWindow: 262144,
    id: 'kimi-k2.5',
    input: ['text', 'image'],
    maxTokens: 65536,
    name: 'Kimi K2.5',
    reasoning: true
  },
  {
    contextWindow: 262144,
    id: 'kimi-k2',
    input: ['text', 'image'],
    maxTokens: 65536,
    name: 'Kimi K2',
    reasoning: true
  },
  {
    contextWindow: 262144,
    id: 'kimi-k2-thinking',
    input: ['text', 'image'],
    maxTokens: 65536,
    name: 'Kimi K2 Thinking',
    reasoning: true
  },
  {
    contextWindow: 128000,
    id: 'big-pickle',
    input: ['text'],
    maxTokens: 16384,
    name: 'Big Pickle',
    reasoning: false
  },
  {
    contextWindow: 128000,
    id: 'nemotron-3-super-free',
    input: ['text'],
    maxTokens: 16384,
    name: 'Nemotron 3 Super Free',
    reasoning: false
  }
];

// Anthropic Messages API models (Claude family + MiniMax)
const ZEN_ANTHROPIC_MODELS: ModelDef[] = [
  {
    contextWindow: 200000,
    id: 'claude-opus-4-7',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'Claude Opus 4.7',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'claude-opus-4-6',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'Claude Opus 4.6',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'claude-opus-4-5',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'Claude Opus 4.5',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'claude-opus-4-1',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'Claude Opus 4.1',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'claude-sonnet-4-6',
    input: ['text', 'image'],
    maxTokens: 32000,
    name: 'Claude Sonnet 4.6',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'claude-sonnet-4-5',
    input: ['text', 'image'],
    maxTokens: 16384,
    name: 'Claude Sonnet 4.5',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'claude-sonnet-4',
    input: ['text', 'image'],
    maxTokens: 16384,
    name: 'Claude Sonnet 4',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'claude-haiku-4-5',
    input: ['text', 'image'],
    maxTokens: 8192,
    name: 'Claude Haiku 4.5',
    reasoning: true
  },
  {
    contextWindow: 200000,
    id: 'claude-3-5-haiku',
    input: ['text', 'image'],
    maxTokens: 8192,
    name: 'Claude Haiku 3.5',
    reasoning: true
  },
  {
    contextWindow: 1000000,
    id: 'minimax-m2.5',
    input: ['text'],
    maxTokens: 65536,
    name: 'MiniMax M2.5',
    reasoning: false
  }
];

// ───────── OpenCode Go ─────────

const GO_OPENAI_MODELS: ModelDef[] = [
  // GLM (Z.ai) — 202,752 ctx per OpenRouter
  {
    contextWindow: 202752,
    id: 'glm-5.1',
    input: ['text'],
    maxTokens: 65535,
    name: 'GLM 5.1',
    reasoning: true
  },
  {
    contextWindow: 202752,
    id: 'glm-5',
    input: ['text'],
    maxTokens: 16384,
    name: 'GLM 5',
    reasoning: true
  },

  // Kimi (Moonshot) — 256K ctx
  {
    contextWindow: 262144,
    id: 'kimi-k2.6',
    input: ['text', 'image'],
    maxTokens: 65536,
    name: 'Kimi K2.6',
    reasoning: true
  },
  {
    contextWindow: 262144,
    id: 'kimi-k2.5',
    input: ['text', 'image'],
    maxTokens: 65536,
    name: 'Kimi K2.5',
    reasoning: true
  },

  // MiMo (Xiaomi) — 1M ctx across V2 / V2.5 family
  {
    contextWindow: 1048576,
    id: 'mimo-v2.5-pro',
    input: ['text', 'image'],
    maxTokens: 65536,
    name: 'MiMo V2.5 Pro',
    reasoning: true
  },
  {
    contextWindow: 1048576,
    id: 'mimo-v2.5',
    input: ['text', 'image'],
    maxTokens: 65536,
    name: 'MiMo V2.5',
    reasoning: true
  },
  {
    contextWindow: 1048576,
    id: 'mimo-v2-pro',
    input: ['text'],
    maxTokens: 65536,
    name: 'MiMo V2 Pro',
    reasoning: true
  },
  {
    contextWindow: 1048576,
    id: 'mimo-v2-omni',
    input: ['text', 'image'],
    maxTokens: 65536,
    name: 'MiMo V2 Omni',
    reasoning: true
  },

  // Qwen
  {
    contextWindow: 1000000,
    id: 'qwen3.6-plus',
    input: ['text'],
    maxTokens: 65536,
    name: 'Qwen 3.6 Plus',
    reasoning: false
  },
  {
    contextWindow: 1000000,
    id: 'qwen3.5-plus',
    input: ['text'],
    maxTokens: 65536,
    name: 'Qwen 3.5 Plus',
    reasoning: false
  },

  // DeepSeek V4 — both Pro (1.6T/49B) and Flash (284B/13B) are 1M ctx
  {
    contextWindow: 1048576,
    id: 'deepseek-v4-pro',
    input: ['text'],
    maxTokens: 65536,
    name: 'DeepSeek V4 Pro',
    reasoning: true
  },
  {
    contextWindow: 1048576,
    id: 'deepseek-v4-flash',
    input: ['text'],
    maxTokens: 65536,
    name: 'DeepSeek V4 Flash',
    reasoning: true
  }
];

const GO_ANTHROPIC_MODELS: ModelDef[] = [
  {
    contextWindow: 1000000,
    id: 'minimax-m2.7',
    input: ['text'],
    maxTokens: 65536,
    name: 'MiniMax M2.7',
    reasoning: true
  },
  {
    contextWindow: 1000000,
    id: 'minimax-m2.5',
    input: ['text'],
    maxTokens: 65536,
    name: 'MiniMax M2.5',
    reasoning: false
  }
];

export default function (pi: ExtensionAPI) {
  // Zen — OpenAI Chat Completions
  pi.registerProvider('opencode-zen', {
    api: 'openai-completions',
    apiKey: 'OPENCODE_API_KEY',
    baseUrl: 'https://opencode.ai/zen/v1',
    models: ZEN_OPENAI_MODELS.map(toOpenAIModel)
  });

  // Zen — Anthropic Messages (Claude family + MiniMax)
  pi.registerProvider('opencode-zen-anthropic', {
    api: 'anthropic-messages',
    apiKey: 'OPENCODE_API_KEY',
    baseUrl: 'https://opencode.ai/zen',
    models: ZEN_ANTHROPIC_MODELS.map(toAnthropicModel)
  });

  // Go — OpenAI Chat Completions
  pi.registerProvider('opencode-go', {
    api: 'openai-completions',
    apiKey: 'OPENCODE_API_KEY',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    models: GO_OPENAI_MODELS.map(toOpenAIModel)
  });

  // Go — Anthropic Messages (MiniMax)
  pi.registerProvider('opencode-go-anthropic', {
    api: 'anthropic-messages',
    apiKey: 'OPENCODE_API_KEY',
    baseUrl: 'https://opencode.ai/zen/go',
    models: GO_ANTHROPIC_MODELS.map(toAnthropicModel)
  });
}
