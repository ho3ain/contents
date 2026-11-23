import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { HttpStatus } from '@nestjs/common';
import { EntitlementsService } from '../commerce/entitlements.service';
import { ApiException } from '../../common/errors/api-error';
import { businessEvent } from '../../common/logging/app-logger';
import { getRequestContext } from '../../common/logging/request-context';
import { recordRuntimeGatewayOutcome } from '../../common/observability/metrics';
import { RuntimesService } from './runtimes.service';
import { ManagedRuntimeService } from './managed-runtime.service';
import { ConnectorClientService } from './connector-client.service';
import { GatewayAssertionService } from './gateway-assertion.service';
import { UsageMeteringService } from '../finance/usage-metering.service';
import { ReviewAccessService } from '../technical-review/review-access.service';
import {
  RUNTIME_GATEWAY_MAX_INPUT_BYTES,
  RUNTIME_GATEWAY_MAX_OUTPUT_BYTES,
} from './runtime-domain';

/** The only reference execution boundary. There is deliberately no direct Runtime execute route. */
@Injectable()
export class RuntimeGatewayService {
  constructor(
    private readonly runtimes: RuntimesService,
    private readonly entitlements: EntitlementsService,
    private readonly managed: ManagedRuntimeService,
    private readonly connector: ConnectorClientService,
    private readonly assertions: GatewayAssertionService,
    private readonly usage: UsageMeteringService,
    private readonly reviewAccess: ReviewAccessService,
  ) {}

  async execute(input: {
    userId: string;
    runtimeId: string;
    payload: unknown;
  }): Promise<Record<string, unknown>> {
    const { runtime, release } = await this.runtimes.servingRuntime(
      input.runtimeId,
    );
    const decision = await this.entitlements.decideAccess(
      input.userId,
      runtime.agentId,
      'runtime',
    );

    /**
     * Two independent authorization paths, in strict order:
     *   1. a real commercial entitlement (the buyer path), or
     *   2. a live reviewer trial grant (the review path).
     *
     * The review path is only consulted AFTER the commercial decision has
     * already refused, it consumes a capped invocation budget, and it is never
     * written back as an entitlement. A reviewer therefore gains execution
     * access without acquiring any commercial right.
     */
    let reviewGrantId: string | null = null;
    if (!decision.allowed) {
      const grant = await this.reviewAccess.consume({
        reviewerId: input.userId,
        runtimeId: runtime.id,
      });
      if (!grant) {
        recordRuntimeGatewayOutcome('denied_entitlement');
        businessEvent.warn(
          'runtime.gateway.denied',
          'Runtime gateway denied entitlement',
          {
            runtimeModel: runtime.executionModel,
            reasonCode: decision.reasonCode,
            policySequence: decision.policySequence,
          },
        );
        throw new ApiException(
          'NOT_ENTITLED',
          'Runtime access is not permitted',
          HttpStatus.FORBIDDEN,
          {
            reasonCode: decision.reasonCode,
          },
        );
      }
      reviewGrantId = grant.id;
    }
    const correlationId = getRequestContext()?.requestId ?? randomUUID();
    let usageEventId: string | null = null;
    try {
      // This is the only Phase 4 creator limit that is currently enforceable:
      // a buyer-authenticated request crossing MESH's own Runtime gateway.
      // It records an execution attempt before dispatch, so concurrent calls
      // cannot pass a client-side counter. It creates no buyer charge.
      const inputBytes = Buffer.byteLength(
        JSON.stringify(input.payload),
        'utf8',
      );
      if (inputBytes > RUNTIME_GATEWAY_MAX_INPUT_BYTES) {
        throw new ApiException(
          'PAYLOAD_TOO_LARGE',
          'Runtime input exceeded the supported limit',
          HttpStatus.PAYLOAD_TOO_LARGE,
          { maxInputBytes: RUNTIME_GATEWAY_MAX_INPUT_BYTES },
        );
      }
      // A reviewer is not a buyer. Metering a review execution would corrupt
      // creator usage figures and the limits derived from them, so the review
      // path records its consumption on the grant (and the audit log) instead.
      if (!reviewGrantId) {
        const reservation = await this.usage.reserveGatewayExecution({
          runtime,
          buyerId: input.userId,
          releaseId: release.id,
          correlationId,
          inputBytes,
        });
        usageEventId = reservation.usageEventId;
      }
      let result: Record<string, unknown>;
      if (runtime.executionModel === 'mesh_managed') {
        const execution = await this.managed.execute(input.payload);
        result = { ...execution };
      } else if (
        runtime.executionModel === 'mesh_connected' &&
        runtime.endpointUrl
      ) {
        const assertion = await this.assertions.sign({
          sub: input.userId,
          runtimeId: runtime.id,
          agentId: runtime.agentId,
          releaseId: release.id,
          jti: randomUUID(),
        });
        result = await this.connector.execute({
          endpointUrl: runtime.endpointUrl,
          assertion,
          correlationId,
          payload: input.payload,
        });
      } else {
        recordRuntimeGatewayOutcome('unsupported_model');
        throw new ApiException(
          'NOT_IMPLEMENTED',
          'This product delivery model has no MESH Runtime execution boundary',
          HttpStatus.CONFLICT,
        );
      }
      // Managed output is fixed today; connected output is separately bounded
      // by the client. Keep this gateway-level guard for every future serving
      // implementation before API serialization.
      if (
        Buffer.byteLength(JSON.stringify(result), 'utf8') >
        RUNTIME_GATEWAY_MAX_OUTPUT_BYTES
      ) {
        throw new ApiException(
          'PAYLOAD_TOO_LARGE',
          'Runtime output exceeded the supported limit',
          HttpStatus.BAD_GATEWAY,
          { maxOutputBytes: RUNTIME_GATEWAY_MAX_OUTPUT_BYTES },
        );
      }
      recordRuntimeGatewayOutcome('allowed');
      businessEvent.info(
        'runtime.gateway.allowed',
        'Runtime gateway completed protected execution',
        {
          runtimeModel: runtime.executionModel,
          releaseId: release.id,
          capability: 'runtime',
          correlationId,
          accessPath: reviewGrantId ? 'review_grant' : 'entitlement',
        },
      );
      return {
        runtimeId: runtime.id,
        releaseId: release.id,
        correlationId,
        usageEventId,
        accessPath: reviewGrantId ? 'review_grant' : 'entitlement',
        result,
      };
    } catch (error) {
      recordRuntimeGatewayOutcome('execution_failed');
      businessEvent.warn(
        'runtime.gateway.failed',
        'Runtime gateway execution failed',
        {
          runtimeModel: runtime.executionModel,
          releaseId: release.id,
          correlationId,
          errorCode:
            error instanceof ApiException ? error.code : 'SERVICE_UNAVAILABLE',
        },
      );
      throw error;
    }
  }
}
