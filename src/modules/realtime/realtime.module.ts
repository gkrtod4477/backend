import { Module } from '@nestjs/common';

/**
 * Responsibilities: establish WebSocket connections, authenticate join-room,
 * relay code changes/submissions/state broadcasts, return latest state on join.
 * Rule: the gateway never decides authoritative state directly.
 * To be implemented by Worker 3.
 */
@Module({})
export class RealtimeModule {}
