import { Module } from '@nestjs/common';

/**
 * LLM integration adapter.
 * Covers: AI chat intent parsing, feedback generation, judgment assistance.
 * Worker 1 (ai-chat-sessions) will implement the provider.
 */
@Module({})
export class LlmIntegrationModule {}
