import {
  ForbiddenException,
  Inject,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import WebSocket from 'ws';
import {
  REALTIME_AUTH_SERVICE,
  REALTIME_CLOSE_CODE,
  REALTIME_CLOSE_REASON,
  REALTIME_DISCONNECT_SERVICE,
  REALTIME_EVENT,
  REALTIME_ROOM_ACCESS_SERVICE,
} from '../service/realtime.constants';
import {
  JoinRoomPayload,
  RealtimeAuthService,
  RealtimeDisconnectService,
  RealtimeRoomAccessService,
  RoomParticipantsUpdatedEvent,
} from '../service/realtime.interfaces';

interface SocketSession {
  gameRoomId: string;
  userId: string;
}

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly roomSessions = new Map<string, Set<WebSocket>>();
  private readonly socketSessions = new WeakMap<WebSocket, SocketSession>();

  constructor(
    @Inject(REALTIME_AUTH_SERVICE)
    private readonly authService: RealtimeAuthService,
    @Inject(REALTIME_ROOM_ACCESS_SERVICE)
    private readonly roomAccessService: RealtimeRoomAccessService,
    @Inject(REALTIME_DISCONNECT_SERVICE)
    private readonly disconnectService: RealtimeDisconnectService,
  ) {}

  @SubscribeMessage(REALTIME_EVENT.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: JoinRoomPayload,
  ): Promise<void> {
    if (!this.hasText(payload?.accessToken)) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.AUTH_TOKEN_INVALID,
        REALTIME_CLOSE_REASON.AUTH_TOKEN_INVALID,
      );
      return;
    }

    if (!this.hasText(payload.gameRoomId)) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.GAME_ROOM_NOT_FOUND,
        REALTIME_CLOSE_REASON.GAME_ROOM_NOT_FOUND,
      );
      return;
    }

    try {
      const authenticatedUser = await this.authService.validateAccessToken(payload.accessToken);
      const joinRoomState = await this.roomAccessService.getJoinRoomState({
        gameRoomId: payload.gameRoomId,
        userId: authenticatedUser.userId,
      });

      this.bindSocketToRoom(client, {
        gameRoomId: joinRoomState.gameRoomId,
        userId: authenticatedUser.userId,
      });
      this.sendEvent(client, REALTIME_EVENT.ROOM_PARTICIPANTS_UPDATED, joinRoomState.initialState);
    } catch (error) {
      this.handleJoinError(client, error);
    }
  }

  async handleDisconnect(client: WebSocket): Promise<void> {
    const session = this.socketSessions.get(client);

    if (!session) {
      return;
    }

    this.unbindSocketFromRoom(client, session.gameRoomId);
    this.socketSessions.delete(client);

    try {
      await this.disconnectService.handleDisconnect({
        gameRoomId: session.gameRoomId,
        userId: session.userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown disconnect error';
      this.logger.warn(`Failed to process disconnect cleanup: ${message}`);
    }
  }

  private bindSocketToRoom(client: WebSocket, session: SocketSession): void {
    const currentSession = this.socketSessions.get(client);

    if (currentSession) {
      this.unbindSocketFromRoom(client, currentSession.gameRoomId);
    }

    const roomSockets = this.roomSessions.get(session.gameRoomId) ?? new Set<WebSocket>();
    roomSockets.add(client);
    this.roomSessions.set(session.gameRoomId, roomSockets);
    this.socketSessions.set(client, session);
  }

  private unbindSocketFromRoom(client: WebSocket, gameRoomId: string): void {
    const roomSockets = this.roomSessions.get(gameRoomId);

    if (!roomSockets) {
      return;
    }

    roomSockets.delete(client);
    if (roomSockets.size === 0) {
      this.roomSessions.delete(gameRoomId);
    }
  }

  private sendEvent(client: WebSocket, event: string, data: RoomParticipantsUpdatedEvent): void {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(
      JSON.stringify({
        event,
        data,
      }),
    );
  }

  private handleJoinError(client: WebSocket, error: unknown): void {
    if (error instanceof UnauthorizedException) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.AUTH_TOKEN_INVALID,
        REALTIME_CLOSE_REASON.AUTH_TOKEN_INVALID,
      );
      return;
    }

    if (error instanceof ForbiddenException) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.FORBIDDEN_RESOURCE_ACCESS,
        REALTIME_CLOSE_REASON.FORBIDDEN_RESOURCE_ACCESS,
      );
      return;
    }

    if (error instanceof NotFoundException) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.GAME_ROOM_NOT_FOUND,
        REALTIME_CLOSE_REASON.GAME_ROOM_NOT_FOUND,
      );
      return;
    }

    const message = error instanceof Error ? error.message : 'unknown realtime error';
    this.logger.error(`Unexpected join-room failure: ${message}`);
    this.closeSocket(client, REALTIME_CLOSE_CODE.NORMAL_CLOSURE);
  }

  private closeSocket(client: WebSocket, code: number, reason?: string): void {
    if (client.readyState === WebSocket.CLOSING || client.readyState === WebSocket.CLOSED) {
      return;
    }

    client.close(code, reason);
  }

  private hasText(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
