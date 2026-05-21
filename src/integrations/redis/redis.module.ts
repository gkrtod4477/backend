import { Module } from '@nestjs/common';

/**
 * Redis integration adapter.
 * Covers: session connectivity state, current turn cache, broadcast fan-out support.
 * Worker 3 (realtime/runtime) will implement the provider.
 */
@Module({})
export class RedisIntegrationModule {}
