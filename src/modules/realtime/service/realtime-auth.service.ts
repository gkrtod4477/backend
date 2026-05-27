import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtTokenService } from '@integrations/jwt/jwt-token.service';
import type {
  RealtimeAuthenticatedUser,
  RealtimeAuthService,
} from './realtime.interfaces';

@Injectable()
export class JwtRealtimeAuthService implements RealtimeAuthService {
  constructor(private readonly jwtTokenService: JwtTokenService) {}

  async validateAccessToken(accessToken: string): Promise<RealtimeAuthenticatedUser> {
    try {
      const payload = this.jwtTokenService.verifyAccessToken(accessToken);

      return {
        userId: payload.sub,
      };
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Access token is invalid or expired.',
      });
    }
  }
}
