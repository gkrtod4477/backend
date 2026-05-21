import {
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantRole,
} from '../../../shared/enums';

export interface JoinRoomPayload {
  accessToken: string;
  gameRoomId: string;
  userId?: string;
}

export interface RealtimeAuthenticatedUser {
  userId: string;
}

export interface RoomParticipantView {
  userId: string;
  nickname: string;
  role: GameRoomParticipantRole;
  membershipStatus: GameRoomParticipantMembershipStatus;
}

export interface RoomParticipantsUpdatedEvent {
  gameRoomId: string;
  participants: RoomParticipantView[];
  changedParticipant: RoomParticipantView | null;
  gameState: Record<string, unknown>;
  missionState: Record<string, unknown> | null;
  occurredAt: string;
}

export interface RealtimeJoinRoomState {
  gameRoomId: string;
  initialState: RoomParticipantsUpdatedEvent;
}

export interface RealtimeAuthService {
  validateAccessToken(accessToken: string): Promise<RealtimeAuthenticatedUser>;
}

export interface RealtimeRoomAccessService {
  getJoinRoomState(input: {
    gameRoomId: string;
    userId: string;
  }): Promise<RealtimeJoinRoomState>;
}

export interface RealtimeDisconnectService {
  handleDisconnect(input: { gameRoomId: string; userId: string }): Promise<void>;
}
