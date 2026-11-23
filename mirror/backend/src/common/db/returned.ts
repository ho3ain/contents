/**
 * TypeORM's postgres driver returns `[rows, affectedCount]` for UPDATE/DELETE
 * (even with RETURNING) but plain `rows` for SELECT/INSERT. Every
 * `UPDATE|DELETE … RETURNING` result goes through this helper so the shape is
 * normalised in exactly one place. (Forgetting it turns "0 rows affected"
 * into a truthy 2-element array — in the two-factor service that disabled the
 * TOTP replay guard and recovery-code burning until Phase 3 fixed it.)
 */
export function returned<T extends unknown[]>(result: unknown): T {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T;
  }
  return result as T;
}
