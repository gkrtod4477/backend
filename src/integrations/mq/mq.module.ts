import { Module } from '@nestjs/common';

/**
 * Message queue integration adapter.
 * Reserved as an extension point for future heavy execution or AI judgment workloads.
 * Not required for MVP; may remain a no-op stub.
 */
@Module({})
export class MqIntegrationModule {}
