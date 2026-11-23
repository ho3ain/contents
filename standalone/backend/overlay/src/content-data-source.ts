import 'dotenv/config';
import { DataSource } from 'typeorm';

import { ENTITIES } from './database/entities';

/**
 * TypeORM CLI data source for the extract (migrations + seeds).
 * Scaffolding — not MESH source.
 *
 * MESH's own `src/database/data-source.ts` additionally negotiates TLS through
 * `buildDbSsl()`. If you deploy this anywhere real, port that logic across or
 * supply `ssl` yourself.
 */
export const ContentDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME ?? 'agenthub',
  username: process.env.DB_USERNAME ?? 'agenthub',
  password: process.env.DB_PASSWORD ?? 'agenthub',
  entities: ENTITIES,
  migrations: [`${__dirname}/database/migrations/*.{ts,js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: false,
});

export default ContentDataSource;
