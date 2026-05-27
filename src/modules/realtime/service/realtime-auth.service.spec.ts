import { UnauthorizedException } from '@nestjs/common';
import { JwtTokenService } from '@integrations/jwt/jwt-token.service';
import { JwtRealtimeAuthService } from './realtime-auth.service';

describe('JwtRealtimeAuthService', () => {
  it('returns the authenticated user id for a valid access token', async () => {
    const jwtTokenService: jest.Mocked<Pick<JwtTokenService, 'verifyAccessToken'>> = {
      verifyAccessToken: jest.fn().mockReturnValue({
        sub: 'user-1',
        loginId: 'player',
      }),
    };
    const service = new JwtRealtimeAuthService(
      jwtTokenService as unknown as JwtTokenService,
    );

    await expect(service.validateAccessToken('token')).resolves.toEqual({
      userId: 'user-1',
    });
  });

  it('rejects invalid access tokens', async () => {
    const jwtTokenService: jest.Mocked<Pick<JwtTokenService, 'verifyAccessToken'>> = {
      verifyAccessToken: jest.fn().mockImplementation(() => {
        throw new Error('invalid token');
      }),
    };
    const service = new JwtRealtimeAuthService(
      jwtTokenService as unknown as JwtTokenService,
    );

    await expect(service.validateAccessToken('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
