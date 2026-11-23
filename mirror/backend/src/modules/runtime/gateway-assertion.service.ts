import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../common/errors/api-error';

export interface RuntimeGatewayAssertionClaims {
  iss: 'mesh-runtime-gateway';
  aud: 'mesh-connector';
  sub: string;
  runtimeId: string;
  agentId: string;
  releaseId: string;
  capability: 'runtime';
  jti: string;
  iat?: number;
  exp?: number;
}

/** A short-lived per-invocation assertion, distinct from browser/session JWTs and Runtime credentials. */
@Injectable()
export class GatewayAssertionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async sign(
    input: Omit<RuntimeGatewayAssertionClaims, 'iss' | 'aud' | 'capability'>,
  ): Promise<string> {
    const secret = this.config.get<string | null>(
      'runtimeGatewaySigningSecret',
    );
    if (!secret) {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Connected Runtime gateway signing is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.jwt.signAsync(
      {
        ...input,
        iss: 'mesh-runtime-gateway',
        aud: 'mesh-connector',
        capability: 'runtime',
      },
      {
        secret,
        issuer: 'mesh-runtime-gateway',
        audience: 'mesh-connector',
        expiresIn: 60,
        jwtid: input.jti,
      },
    );
  }
}
