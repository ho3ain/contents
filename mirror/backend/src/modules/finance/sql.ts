/**
 * TypeORM's Postgres driver returns `[rows, affectedCount]` for UPDATE and
 * DELETE statements (and plain `rows` for SELECT / INSERT). Every
 * `UPDATE … RETURNING` in the finance module goes through this helper so the
 * result shape is normalised in exactly one place.
 */
export { returned } from '../../common/db/returned';
