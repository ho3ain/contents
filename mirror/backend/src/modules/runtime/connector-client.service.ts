import { Injectable } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../common/errors/api-error';
import {
  MESH_CONNECTOR_PROTOCOL_VERSION,
  RUNTIME_GATEWAY_MAX_OUTPUT_BYTES,
} from './runtime-domain';

interface ConnectorHealth {
  protocolVersion: string;
  runtimeId: string;
  status: 'ready' | 'degraded';
  connectorVersion?: string;
}

/** Consume an execution response incrementally. Content-Length is advisory,
 * so chunks are counted as well before JSON parsing/serialization. */
async function readBoundedResponse(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(contentLength) &&
    contentLength > RUNTIME_GATEWAY_MAX_OUTPUT_BYTES
  ) {
    throw new ApiException(
      'PAYLOAD_TOO_LARGE',
      'Connected Runtime response exceeded the supported limit',
      HttpStatus.BAD_GATEWAY,
      { maxOutputBytes: RUNTIME_GATEWAY_MAX_OUTPUT_BYTES },
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    received += next.value.byteLength;
    if (received > RUNTIME_GATEWAY_MAX_OUTPUT_BYTES) {
      // Best-effort cancellation must not replace the safe size error.
      void reader.cancel().catch(() => undefined);
      throw new ApiException(
        'PAYLOAD_TOO_LARGE',
        'Connected Runtime response exceeded the supported limit',
        HttpStatus.BAD_GATEWAY,
        { maxOutputBytes: RUNTIME_GATEWAY_MAX_OUTPUT_BYTES },
      );
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Outbound Connector Protocol client. Registration URLs are an SSRF boundary:
 * production accepts only public HTTPS targets; loopback is test-only so the
 * in-repository reference connector can be exercised without a cloud service.
 */
@Injectable()
export class ConnectorClientService {
  async health(
    endpointUrl: string,
    runtimeId: string,
  ): Promise<ConnectorHealth> {
    const url = await this.safeEndpoint(
      endpointUrl,
      '/mesh-connector/v1/health',
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Mesh-Protocol-Version': MESH_CONNECTOR_PROTOCOL_VERSION,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const body = (await response.json()) as Partial<ConnectorHealth>;
      if (
        body.protocolVersion !== MESH_CONNECTOR_PROTOCOL_VERSION ||
        body.runtimeId !== runtimeId ||
        (body.status !== 'ready' && body.status !== 'degraded')
      ) {
        throw new Error('INVALID_CONNECTOR_HEALTH');
      }
      return {
        protocolVersion: body.protocolVersion,
        runtimeId: body.runtimeId,
        status: body.status,
        connectorVersion:
          typeof body.connectorVersion === 'string'
            ? body.connectorVersion.slice(0, 64)
            : undefined,
      };
    } catch {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Connected Runtime health check failed',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Probe only the required reference contract property: a connector must not
   * accept a direct execution request without a MESH gateway assertion. */
  async directBypassRejected(endpointUrl: string): Promise<boolean> {
    const url = await this.safeEndpoint(
      endpointUrl,
      '/mesh-connector/v1/execute',
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mesh-Protocol-Version': MESH_CONNECTOR_PROTOCOL_VERSION,
        },
        body: JSON.stringify({ input: {} }),
        signal: controller.signal,
      });
      return response.status === 401 || response.status === 403;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async execute(input: {
    endpointUrl: string;
    assertion: string;
    correlationId: string;
    payload: unknown;
  }): Promise<Record<string, unknown>> {
    const url = await this.safeEndpoint(
      input.endpointUrl,
      '/mesh-connector/v1/execute',
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Mesh-Protocol-Version': MESH_CONNECTOR_PROTOCOL_VERSION,
          'X-Mesh-Gateway-Assertion': input.assertion,
          'X-Mesh-Correlation-Id': input.correlationId,
        },
        body: JSON.stringify({ input: input.payload }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ApiException(
          'SERVICE_UNAVAILABLE',
          'Connected Runtime rejected or could not complete the request',
          HttpStatus.BAD_GATEWAY,
        );
      }
      // Read and bound bytes before JSON parsing so a creator-controlled
      // connector cannot hand an unbounded document to the API process.
      const serialized = await readBoundedResponse(response);
      let body: unknown;
      try {
        body = JSON.parse(serialized) as unknown;
      } catch {
        throw new ApiException(
          'SERVICE_UNAVAILABLE',
          'Connected Runtime returned an invalid response',
          HttpStatus.BAD_GATEWAY,
        );
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiException(
          'SERVICE_UNAVAILABLE',
          'Connected Runtime returned an invalid response',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return body as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Connected Runtime is unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async safeEndpoint(base: string, path: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(base);
    } catch {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Runtime endpoint URL is invalid',
        HttpStatus.BAD_REQUEST,
      );
    }
    const test = process.env.NODE_ENV === 'test';
    if (parsed.username || parsed.password || parsed.hash || parsed.search) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Runtime endpoint URL must not contain credentials, query or fragment',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      parsed.protocol !== 'https:' &&
      !(test && parsed.protocol === 'http:')
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Connected Runtime endpoints must use HTTPS',
        HttpStatus.BAD_REQUEST,
      );
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      !test &&
      (hostname === 'localhost' || this.isBlockedAddress(hostname))
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Runtime endpoint is not a public address',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!test) {
      const addresses: Array<{ address: string }> = await lookup(hostname, {
        all: true,
        verbatim: true,
      }).catch(() => [] as Array<{ address: string }>);
      if (
        addresses.length === 0 ||
        addresses.some((entry) => this.isBlockedAddress(entry.address))
      ) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'Runtime endpoint is not a public address',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}${path}`;
    return parsed.toString();
  }

  private isBlockedAddress(address: string): boolean {
    const normalized = address.toLowerCase().replace(/^::ffff:/, '');
    if (
      normalized === 'localhost' ||
      normalized === '::1' ||
      normalized === '0.0.0.0' ||
      normalized === '::'
    )
      return true;
    if (
      /^127\./.test(normalized) ||
      /^10\./.test(normalized) ||
      /^192\.168\./.test(normalized) ||
      /^169\.254\./.test(normalized)
    )
      return true;
    const private172 = /^172\.(\d+)\./.exec(normalized);
    if (
      private172 &&
      Number(private172[1]) >= 16 &&
      Number(private172[1]) <= 31
    )
      return true;
    return (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }
}
