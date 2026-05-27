import { Injectable, NotFoundException } from '@nestjs/common';
import { toSeoulIso } from '@common/utils/date.util';
import { User } from '@modules/auth/entity/user.entity';
import { GameRoomMissionStepEntity } from '@modules/game-room-missions/entity/game-room-mission-step.entity';
import { GameRoomMissionEntity } from '@modules/game-room-missions/entity/game-room-mission.entity';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import {
  GameRoomParticipantMembershipStatus,
  GameRoomStatus,
  TurnStatus,
} from '@shared/enums';
import { DataSource, In } from 'typeorm';
import type {
  RoomParticipantView,
  RoomParticipantsUpdatedEvent,
} from './realtime.interfaces';

export interface RoomRealtimeContext {
  room: GameRoomEntity;
  participants: RoomParticipantView[];
  gameState: Record<string, unknown>;
  missionState: Record<string, unknown> | null;
}

@Injectable()
export class RealtimeRoomStateService {
  constructor(private readonly dataSource: DataSource) {}

  async buildParticipantsUpdatedEvent(input: {
    gameRoomId: string;
    changedUserId?: string | null;
    occurredAt?: string;
  }): Promise<RoomParticipantsUpdatedEvent> {
    const context = await this.loadRoomRealtimeContext(input.gameRoomId);
    const changedParticipant =
      input.changedUserId === undefined
        ? null
        : context.participants.find(
            (participant) => participant.userId === input.changedUserId,
          ) ?? null;

    return {
      gameRoomId: input.gameRoomId,
      participants: context.participants,
      changedParticipant,
      gameState: context.gameState,
      missionState: context.missionState,
      occurredAt: input.occurredAt ?? toSeoulIso(new Date()),
    };
  }

  async loadRoomRealtimeContext(gameRoomId: string): Promise<RoomRealtimeContext> {
    const roomRepository = this.dataSource.getRepository(GameRoomEntity);
    const room = await roomRepository.findOne({
      where: { id: gameRoomId },
    });

    if (!room) {
      throw new NotFoundException({
        code: 'GAME_ROOM_NOT_FOUND',
        message: 'Game room was not found.',
      });
    }

    const participantRepository = this.dataSource.getRepository(
      GameRoomParticipantEntity,
    );
    const participants = await participantRepository.find({
      where: { gameRoomId },
      order: { createdAt: 'ASC' },
    });
    const nicknameByUserId = await this.loadNicknameByUserId(
      participants.map((participant) => participant.userId),
    );
    const participantViews = participants.map((participant) =>
      toParticipantView(participant, nicknameByUserId),
    );

    if (room.status !== GameRoomStatus.IN_PROGRESS) {
      return {
        room,
        participants: participantViews,
        gameState: {
          status: room.status,
        },
        missionState: null,
      };
    }

    const missionRepository = this.dataSource.getRepository(GameRoomMissionEntity);
    const mission = await missionRepository.findOne({
      where: { gameRoomId },
    });
    const currentStep = mission?.currentStepId
      ? await this.dataSource.getRepository(GameRoomMissionStepEntity).findOne({
          where: { id: mission.currentStepId },
          relations: { missionTemplateStep: true },
        })
      : null;
    const currentTurn = await this.dataSource.getRepository(TurnEntity).findOne({
      where: {
        gameRoomId,
        status: TurnStatus.IN_PROGRESS,
      },
      order: {
        turnNumber: 'DESC',
      },
    });

    return {
      room,
      participants: participantViews,
      gameState: buildInProgressGameState(room, mission, currentTurn),
      missionState: mission
        ? buildMissionState(room, mission, currentStep)
        : null,
    };
  }

  private async loadNicknameByUserId(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const users = await this.dataSource.getRepository(User).find({
      where: {
        id: In(uniqueUserIds),
      },
    });

    return new Map(users.map((user) => [user.id, user.nickname] as const));
  }
}

function toParticipantView(
  participant: GameRoomParticipantEntity,
  nicknameByUserId: Map<string, string>,
): RoomParticipantView {
  return {
    userId: participant.userId,
    nickname: nicknameByUserId.get(participant.userId) ?? participant.userId,
    role: participant.role,
    membershipStatus: participant.membershipStatus,
  };
}

function buildInProgressGameState(
  room: GameRoomEntity,
  mission: GameRoomMissionEntity | null,
  currentTurn: TurnEntity | null,
): Record<string, unknown> {
  return {
    status: room.status,
    strikeCount: mission?.strikeCount ?? 0,
    maxStrikeCount: room.maxStrikeCount,
    turnState: currentTurn
      ? {
          turnId: currentTurn.id,
          turnNumber: currentTurn.turnNumber,
          currentPlayerId: currentTurn.playerUserId,
          startedAt: toSeoulIso(currentTurn.startedAt),
          deadlineAt: toSeoulIso(currentTurn.deadlineAt),
          timeLimitSeconds: room.timeLimitSeconds,
          remainingTimeSeconds: Math.max(
            0,
            Math.ceil(
              (currentTurn.deadlineAt.getTime() - Date.now()) / 1000,
            ),
          ),
          status: currentTurn.status,
        }
      : null,
  };
}

function buildMissionState(
  room: GameRoomEntity,
  mission: GameRoomMissionEntity,
  currentStep: GameRoomMissionStepEntity | null,
): Record<string, unknown> {
  return {
    missionId: mission.id,
    missionTemplateId: mission.missionTemplateId,
    currentStepId: currentStep?.id ?? null,
    currentStepStatus: currentStep?.status ?? null,
    difficulty: room.difficulty,
    strikeCount: mission.strikeCount,
    projectStructure: mission.projectStructureJson,
  };
}
