import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmIntegrationModule } from '../../integrations/llm/llm.module';
import { GameRoomMissionsModule } from '../game-room-missions/game-room-missions.module';
import { GameRoomParticipantsModule } from '../game-room-participants/game-room-participants.module';
import { GameRoomParticipantEntity } from '../game-room-participants/entity/game-room-participant.entity';
import { GameRoomsModule } from '../game-rooms/game-rooms.module';
import { User } from '../auth/entity/user.entity';
import { AiChatSessionsController } from './controller/ai-chat-sessions.controller';
import { AiChatSessionsService } from './ai-chat-sessions.service';
import { AiChatMessage } from './entity/ai-chat-message.entity';
import { AiChatRequest } from './entity/ai-chat-request.entity';
import { AiChatSession } from './entity/ai-chat-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiChatSession,
      AiChatRequest,
      AiChatMessage,
      User,
      GameRoomParticipantEntity,
    ]),
    LlmIntegrationModule,
    GameRoomMissionsModule,
    GameRoomsModule,
    GameRoomParticipantsModule,
  ],
  controllers: [AiChatSessionsController],
  providers: [AiChatSessionsService],
  exports: [AiChatSessionsService, TypeOrmModule],
})
export class AiChatSessionsModule {}
