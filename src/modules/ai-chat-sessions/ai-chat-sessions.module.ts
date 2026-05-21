import { Module } from '@nestjs/common';

/**
 * Responsibilities: fetch AI chat sessions/messages, accept user messages,
 * interpret ROOM_CREATE / USER_INVITE / ROOM_JOIN / USER_INVITE_DENY / GAME_START intents.
 * Dependencies: integrations/llm, game-rooms, game-room-participants.
 * To be implemented by Worker 1.
 */
@Module({})
export class AiChatSessionsModule {}
