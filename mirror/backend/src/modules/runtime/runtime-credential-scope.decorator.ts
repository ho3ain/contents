import { SetMetadata } from '@nestjs/common';
import type { RuntimeCredentialScope } from '../../database/entities/runtime/runtime-credential.entity';

/**
 * Documents the credential scope enforced inside a @Public Runtime connector
 * handler. It lets route contracts distinguish credential-authenticated
 * connector endpoints from genuinely anonymous HTTP routes.
 */
export const RUNTIME_CREDENTIAL_SCOPE_KEY = 'runtimeCredentialScope';
export const RequireRuntimeCredentialScope = (scope: RuntimeCredentialScope) =>
  SetMetadata(RUNTIME_CREDENTIAL_SCOPE_KEY, scope);
