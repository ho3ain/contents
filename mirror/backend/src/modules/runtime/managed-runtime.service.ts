import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { ApiException } from '../../common/errors/api-error';
import { HttpStatus } from '@nestjs/common';

/**
 * Local managed-provider reference implementation.
 *
 * It intentionally accepts only the fixed, bundled reference workload. There
 * is no artifact upload or arbitrary command path. On Linux it uses an
 * unprivileged user + PID + network namespace; network is empty, process and
 * virtual-memory/file limits are applied by the child and the parent enforces
 * a wall-clock timeout. This is useful real test infrastructure, not a claim
 * that arbitrary hostile creator code is safely sandboxed.
 */
@Injectable()
export class ManagedRuntimeService {
  private readonly unsharePath = '/usr/bin/unshare';

  isAvailable(): boolean {
    return process.platform === 'linux' && existsSync(this.unsharePath);
  }

  profile() {
    return {
      provider: 'mesh_local_user_namespace',
      available: this.isAvailable(),
      trustedFixedWorkloadOnly: true,
      network: 'new empty network namespace',
      processLimit: 16,
      virtualMemoryMiB: 64,
      fileSizeKiB: 512,
      cpuSeconds: 1,
      wallTimeoutMs: 1_500,
      filesystem:
        'not a filesystem sandbox: fixed workload has a host root view in its mount namespace; no creator-supplied path/executable is accepted',
      unsupported: [
        'filesystem isolation',
        'arbitrary creator code',
        'persistent customer data',
        'creator secrets',
        'GPU workloads',
        'public ingress',
      ],
    };
  }

  async probe(): Promise<{ ok: boolean; isolation: boolean; detail: string }> {
    if (!this.isAvailable()) {
      return {
        ok: false,
        isolation: false,
        detail: 'linux user namespace runner unavailable',
      };
    }
    try {
      const result = await this.execute({ probe: true });
      return {
        ok: result.status === 'ok',
        isolation: true,
        detail:
          result.status === 'ok'
            ? 'local namespace reference workload completed'
            : 'reference workload failed',
      };
    } catch (error) {
      return {
        ok: false,
        isolation: false,
        detail: error instanceof Error ? error.name : 'managed runner failed',
      };
    }
  }

  async execute(input: unknown): Promise<{
    status: 'ok';
    workload: 'mesh_reference_echo_v1';
    correlationId: string;
    received: boolean;
  }> {
    if (!this.isAvailable()) {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'The approved local managed Runtime isolation provider is unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const correlationId = randomUUID();
    // The shell program is static. `input` goes through stdin only and is not
    // interpolated into shell source or command arguments.
    const script = [
      'set -efu',
      'ulimit -t 1',
      'ulimit -v 65536',
      'ulimit -f 512',
      'ulimit -u 16',
      'IFS= read -r payload || true',
      'printf \'{"status":"ok","workload":"mesh_reference_echo_v1","received":true}\\n\'',
    ].join('; ');
    const payload = JSON.stringify({ input, correlationId });
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        this.unsharePath,
        ['-Urnmpf', '--mount-proc', '/bin/bash', '-ceu', script],
        {
          cwd: '/tmp',
          env: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/nonexistent' },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      let output = '';
      let errorOutput = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new ApiException(
            'SERVICE_UNAVAILABLE',
            'Managed Runtime execution timed out',
            HttpStatus.GATEWAY_TIMEOUT,
          ),
        );
      }, 1_500);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        errorOutput += chunk;
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          // Deliberately do not propagate untrusted child stderr (it could
          // contain input or an accidental secret); preserve only safe state.
          void errorOutput;
          reject(
            new ApiException(
              'SERVICE_UNAVAILABLE',
              'Managed Runtime execution failed',
              HttpStatus.BAD_GATEWAY,
            ),
          );
          return;
        }
        resolve(output);
      });
      child.stdin.end(`${payload}\n`);
    });
    let parsed: { status?: string; workload?: string; received?: boolean };
    try {
      parsed = JSON.parse(stdout.trim()) as typeof parsed;
    } catch {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Managed Runtime returned an invalid response',
        HttpStatus.BAD_GATEWAY,
      );
    }
    if (
      parsed.status !== 'ok' ||
      parsed.workload !== 'mesh_reference_echo_v1' ||
      parsed.received !== true
    ) {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'Managed Runtime reference response was invalid',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return {
      status: 'ok',
      workload: 'mesh_reference_echo_v1',
      correlationId,
      received: true,
    };
  }
}
