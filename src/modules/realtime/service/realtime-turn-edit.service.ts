import { Injectable } from '@nestjs/common';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import { GameRoomStatus, TurnStatus } from '@shared/enums';
import { DataSource } from 'typeorm';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import type {
  RealtimeTurnEditAuthorization,
  RealtimeTurnEditService,
} from './realtime.interfaces';

@Injectable()
export class DatabaseRealtimeTurnEditService implements RealtimeTurnEditService {
  constructor(private readonly dataSource: DataSource) {}

  async authorizeCodeChange(input: {
    gameRoomId: string;
    userId: string;
  }): Promise<RealtimeTurnEditAuthorization> {
    const room = await this.dataSource.getRepository(GameRoomEntity).findOne({
      where: { id: input.gameRoomId },
    });

    if (!room || room.status !== GameRoomStatus.IN_PROGRESS) {
      return {
        isEditable: false,
        currentTurnId: null,
        currentTurnUserId: null,
      };
    }

    const currentTurn = await this.dataSource.getRepository(TurnEntity).findOne({
      where: {
        gameRoomId: input.gameRoomId,
        status: TurnStatus.IN_PROGRESS,
      },
      order: {
        turnNumber: 'DESC',
      },
    });

    if (!currentTurn) {
      return {
        isEditable: false,
        currentTurnId: null,
        currentTurnUserId: null,
      };
    }

    return {
      isEditable: currentTurn.playerUserId === input.userId,
      currentTurnId: currentTurn.id,
      currentTurnUserId: currentTurn.playerUserId,
    };
  }
}
