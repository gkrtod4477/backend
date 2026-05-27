import { ForbiddenException, Injectable } from '@nestjs/common';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import {
  GameRoomParticipantMembershipStatus,
} from '@shared/enums';
import { DataSource } from 'typeorm';
import type {
  RealtimeJoinRoomState,
  RealtimeRoomAccessService,
} from './realtime.interfaces';
import { RealtimeRoomStateService } from './realtime-room-state.service';

@Injectable()
export class DatabaseRealtimeRoomAccessService implements RealtimeRoomAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly realtimeRoomStateService: RealtimeRoomStateService,
  ) {}

  async getJoinRoomState(input: {
    gameRoomId: string;
    userId: string;
  }): Promise<RealtimeJoinRoomState> {
    const participantRepository = this.dataSource.getRepository(
      GameRoomParticipantEntity,
    );
    const membership = await participantRepository.findOne({
      where: {
        gameRoomId: input.gameRoomId,
        userId: input.userId,
      },
    });

    if (
      !membership ||
      !isActiveRoomMembership(membership.membershipStatus)
    ) {
      throw new ForbiddenException({
        code: 'GAME_ROOM_ACCESS_FORBIDDEN',
        message: 'User does not have access to this game room.',
      });
    }

    const initialState = await this.realtimeRoomStateService.buildParticipantsUpdatedEvent({
      gameRoomId: input.gameRoomId,
    });

    return {
      gameRoomId: input.gameRoomId,
      initialState,
    };
  }
}

function isActiveRoomMembership(
  status: GameRoomParticipantMembershipStatus,
): boolean {
  return (
    status === GameRoomParticipantMembershipStatus.JOINED ||
    status === GameRoomParticipantMembershipStatus.INVITED
  );
}
