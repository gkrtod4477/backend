import { registerAs } from '@nestjs/config';

export default registerAs('llm', () => ({
  apiKey: process.env.LLM_API_KEY,
  baseUrl: process.env.LLM_BASE_URL,
  model: process.env.LLM_MODEL ?? 'gpt-4o',
  timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS ?? '30000', 10),
}));
