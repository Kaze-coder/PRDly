import type { AIModel } from '@/types';

export const AI_MODELS: AIModel[] = [
  {
    id: 'agentrouter-opus',
    name: 'Claude Opus 4 (AgentRouter)',
    provider: 'AgentRouter',
    speed: 3,
    quality: 5,
  },
  {
    id: 'gemini-flash',
    name: 'Gemini Flash',
    provider: 'Google',
    speed: 5,
    quality: 3,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    speed: 3,
    quality: 4,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    provider: 'Anthropic',
    speed: 3,
    quality: 4,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    speed: 4,
    quality: 4,
  },
  {
    id: 'kimi-k3',
    name: 'Kimi K3',
    provider: 'Moonshot',
    speed: 3,
    quality: 4,
  },
  {
    id: 'deepseek-r2',
    name: 'DeepSeek R2',
    provider: 'DeepSeek',
    speed: 3,
    quality: 4,
  },
  {
    id: 'qwen-3',
    name: 'Qwen 3',
    provider: 'Alibaba',
    speed: 3,
    quality: 4,
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'OpenAI',
    speed: 2,
    quality: 5,
  },
  {
    id: 'claude-opus',
    name: 'Claude Opus',
    provider: 'Anthropic',
    speed: 2,
    quality: 5,
  },
];

export function getModelById(id: string): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}
