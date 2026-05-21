import { Module } from '@nestjs/common';

/**
 * Docker/container runtime integration adapter.
 * Covers: container lifecycle, docker exec, stdout/stderr/exit-code collection.
 * Worker 3 (realtime/runtime) will implement the provider.
 * Ref: docs/specs/07-integrations-and-ai.md (Confirmed Docker Model)
 */
@Module({})
export class RuntimeIntegrationModule {}
