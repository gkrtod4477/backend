import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  RealtimeAuthenticatedUser,
  RealtimeAuthService,
  RealtimeDisconnectService,
  RealtimeJoinRoomState,
  RealtimeRoomAccessService,
} from './realtime.interfaces';

@Injectable()
export class DefaultRealtimeAuthService implements RealtimeAuthService {
  async validateAccessToken(_accessToken: string): Promise<RealtimeAuthenticatedUser> {
    throw new InternalServerErrorException('Realtime auth service is not configured');
  }
}

@Injectable()
export class DefaultRealtimeRoomAccessService implements RealtimeRoomAccessService {
  async getJoinRoomState(_input: {
    gameRoomId: string;
    userId: string;
  }): Promise<RealtimeJoinRoomState> {
    throw new InternalServerErrorException('Realtime room access service is not configured');
  }
}

@Injectable()
export class DefaultRealtimeDisconnectService implements RealtimeDisconnectService {
  async handleDisconnect(_input: { gameRoomId: string; userId: string }): Promise<void> {}
}
