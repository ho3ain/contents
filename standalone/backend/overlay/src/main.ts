import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ContentAppModule } from './content-app.module';

/**
 * Entry point for the extracted content feature. Scaffolding — not MESH source.
 *
 * MESH's own `src/main.ts` additionally wires structured logging, Swagger,
 * metrics, shutdown hooks and `configureApp()`. Those belong to the platform,
 * not to the content feature, so they are not reproduced here.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ContentAppModule);

  // Matches MESH: every route lives under /api/v1.
  app.setGlobalPrefix('api/v1');

  // The blog/SEO DTOs rely on class-validator decorators; without a global
  // ValidationPipe those decorators are inert and invalid payloads reach the
  // services.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`content API listening on :${port}/api/v1`);
}

void bootstrap();
