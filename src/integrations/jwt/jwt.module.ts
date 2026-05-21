import { Module } from '@nestjs/common';

/**
 * JWT integration adapter.
 * Worker 1 (auth) will populate this module with signing and verification logic.
 */
@Module({})
export class JwtIntegrationModule {}
