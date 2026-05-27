import { ForbiddenException } from '@nestjs/common';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import { GameRoomParticipantMembershipStatus } from '@shared/enums';
import { DataSource } from 'typeorm';
import { DatabaseRealtimeRoomAccessService } from './realtime-room-access.service';
import { RealtimeRoomStateService } from './realtime-room-state.service';

describe('DatabaseRealtimeRoomAccessService', () => {
  it('rejects join-room access for users without active membership', async () => {
    const participantRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(participantRepository),
    } as unknown as DataSource;
    const service = new DatabaseRealtimeRoomAccessService(
      dataSource,
      {} as RealtimeRoomStateService,
    );

    await expect(
      service.getJoinRoomState({
        gameRoomId: 'room-1',
        userId: 'outsider',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns initial room state for joined members', async () => {
    const participantRepository = {
      findOne: jest.fn().mockResolvedValue({
        gameRoomId: 'room-1',
        userId: 'user-1',
        membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
      } as GameRoomParticipantEntity),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(participantRepository),
    } as unknown as DataSource;
    const realtimeRoomStateService: jest.Mocked<
      Pick<RealtimeRoomStateService, 'buildParticipantsUpdatedEvent'>
    > = {
      buildParticipantsUpdatedEvent: jest.fn().mockResolvedValue({
        gameRoomId: 'room-1',
        participants: [],
        changedParticipant: null,
        gameState: { status: 'WAITING' },
        missionState: null,
        occurredAt: '2026-05-27T10:00:00+09:00',
      }),
    };
    const service = new DatabaseRealtimeRoomAccessService(
      dataSource,
      realtimeRoomStateService as unknown as RealtimeRoomStateService,
    );

    const result = await service.getJoinRoomState({
      gameRoomId: 'room-1',
      userId: 'user-1',
    });

    expect(result.gameRoomId).toBe('room-1');
    expect(realtimeRoomStateService.buildParticipantsUpdatedEvent).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
    });
  });
});
