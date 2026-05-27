import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import { GameRoomStatus, TurnStatus } from '@shared/enums';
import { DataSource } from 'typeorm';
import { DatabaseRealtimeTurnEditService } from './realtime-turn-edit.service';

describe('DatabaseRealtimeTurnEditService', () => {
  it('allows code edits only for the current turn player', async () => {
    const roomRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'room-1',
        status: GameRoomStatus.IN_PROGRESS,
      } as GameRoomEntity),
    };
    const turnRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'turn-1',
        playerUserId: 'user-1',
        status: TurnStatus.IN_PROGRESS,
      } as TurnEntity),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === GameRoomEntity) {
          return roomRepository;
        }

        return turnRepository;
      }),
    } as unknown as DataSource;
    const service = new DatabaseRealtimeTurnEditService(dataSource);

    await expect(
      service.authorizeCodeChange({
        gameRoomId: 'room-1',
        userId: 'user-1',
      }),
    ).resolves.toEqual({
      isEditable: true,
      currentTurnId: 'turn-1',
      currentTurnUserId: 'user-1',
    });

    await expect(
      service.authorizeCodeChange({
        gameRoomId: 'room-1',
        userId: 'user-2',
      }),
    ).resolves.toEqual({
      isEditable: false,
      currentTurnId: 'turn-1',
      currentTurnUserId: 'user-1',
    });
  });
});
