import { Module } from '@nestjs/common';

/**
 * WebSocket integration adapter.
 * The realtime gateway (Worker 3) will register socket.io or ws adapter here.
 */
@Module({})
export class WebsocketIntegrationModule {}
