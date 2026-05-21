/// <reference types="jest" />
import { ForbiddenException, INestApplication, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import WebSocket from 'ws';
import { NecoWsAdapter } from '../../../integrations/websocket/neco-ws.adapter';
import { GameRoomParticipantMembershipStatus, GameRoomParticipantRole } from '../../../shared/enums';
import { RealtimeModule } from '../realtime.module';
import {
  REALTIME_AUTH_SERVICE,
  REALTIME_DISCONNECT_SERVICE,
  REALTIME_ROOM_ACCESS_SERVICE,
} from '../service/realtime.constants';
import {
  RealtimeAuthService,
  RealtimeDisconnectService,
  RealtimeJoinRoomState,
  RealtimeRoomAccessService,
} from '../service/realtime.interfaces';

describe('RealtimeGateway', () => {
  let app: INestApplication;
  let port: number;
  let authService: jest.Mocked<RealtimeAuthService>;
  let roomAccessService: jest.Mocked<RealtimeRoomAccessService>;
  let disconnectService: jest.Mocked<RealtimeDisconnectService>;

  beforeEach(async () => {
    authService = {
      validateAccessToken: jest.fn(),
    };
    roomAccessService = {
      getJoinRoomState: jest.fn(),
    };
    disconnectService = {
      handleDisconnect: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [RealtimeModule],
    })
      .overrideProvider(REALTIME_AUTH_SERVICE)
      .useValue(authService)
      .overrideProvider(REALTIME_ROOM_ACCESS_SERVICE)
      .useValue(roomAccessService)
      .overrideProvider(REALTIME_DISCONNECT_SERVICE)
      .useValue(disconnectService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new NecoWsAdapter(app));
    await app.listen(0);

    const address = app.getHttpServer().address();
    port = typeof address === 'string' ? 0 : address.port;
  });

  afterEach(async () => {
    await app.close();
  });

  it('closes with 4401 when the token is invalid', async () => {
    authService.validateAccessToken.mockRejectedValue(new UnauthorizedException());

    const socket = await connectClient(port);
    const closeEvent = waitForClose(socket);

    sendJoinRoom(socket, {
      accessToken: 'invalid-token',
      gameRoomId: 'room-001',
      userId: 'user-001',
    });

    await expect(closeEvent).resolves.toEqual({
      code: 4401,
      reason: 'AUTH_TOKEN_INVALID',
    });
  });

  it('closes with 4403 when room access is forbidden', async () => {
    authService.validateAccessToken.mockResolvedValue({ userId: 'user-001' });
    roomAccessService.getJoinRoomState.mockRejectedValue(new ForbiddenException());

    const socket = await connectClient(port);
    const closeEvent = waitForClose(socket);

    sendJoinRoom(socket, {
      accessToken: 'valid-token',
      gameRoomId: 'room-001',
      userId: 'user-999',
    });

    await expect(closeEvent).resolves.toEqual({
      code: 4403,
      reason: 'FORBIDDEN_RESOURCE_ACCESS',
    });
  });

  it('closes with 4404 when the room does not exist', async () => {
    authService.validateAccessToken.mockResolvedValue({ userId: 'user-001' });
    roomAccessService.getJoinRoomState.mockRejectedValue(new NotFoundException());

    const socket = await connectClient(port);
    const closeEvent = waitForClose(socket);

    sendJoinRoom(socket, {
      accessToken: 'valid-token',
      gameRoomId: 'missing-room',
      userId: 'user-001',
    });

    await expect(closeEvent).resolves.toEqual({
      code: 4404,
      reason: 'GAME_ROOM_NOT_FOUND',
    });
  });

  it('closes with 4404 when gameRoomId is missing from the payload', async () => {
    const socket = await connectClient(port);
    const closeEvent = waitForClose(socket);

    socket.send(
      JSON.stringify({
        event: 'join-room',
        data: {
          accessToken: 'valid-token',
        },
      }),
    );

    await expect(closeEvent).resolves.toEqual({
      code: 4404,
      reason: 'GAME_ROOM_NOT_FOUND',
    });
    expect(authService.validateAccessToken).not.toHaveBeenCalled();
    expect(roomAccessService.getJoinRoomState).not.toHaveBeenCalled();
  });

  it('sends the latest allowed state on successful join', async () => {
    authService.validateAccessToken.mockResolvedValue({ userId: 'user-001' });
    roomAccessService.getJoinRoomState.mockResolvedValue(createJoinRoomState());

    const socket = await connectClient(port);
    const messageEvent = waitForMessage(socket);

    sendJoinRoom(socket, {
      accessToken: 'valid-token',
      gameRoomId: 'room-001',
      userId: 'forged-user-id',
    });

    await expect(messageEvent).resolves.toEqual({
      event: 'room-participants-updated',
      data: createJoinRoomState().initialState,
    });
    expect(roomAccessService.getJoinRoomState).toHaveBeenCalledWith({
      gameRoomId: 'room-001',
      userId: 'user-001',
    });
    socket.close();
  });
});

async function connectClient(port: number): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  return socket;
}

function sendJoinRoom(socket: WebSocket, payload: { accessToken: string; gameRoomId: string; userId: string }): void {
  socket.send(
    JSON.stringify({
      event: 'join-room',
      data: payload,
    }),
  );
}

function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.once('close', (code, reason) => {
      resolve({
        code,
        reason: reason.toString(),
      });
    });
  });
}

function waitForMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    socket.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

function createJoinRoomState(): RealtimeJoinRoomState {
  return {
    gameRoomId: 'room-001',
    initialState: {
      gameRoomId: 'room-001',
      participants: [
        {
          userId: 'user-001',
          nickname: 'owner',
          role: GameRoomParticipantRole.OWNER,
          membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
        },
      ],
      changedParticipant: null,
      gameState: {
        status: 'WAITING',
      },
      missionState: null,
      occurredAt: '2026-05-21T12:00:00+09:00',
    },
  };
}
