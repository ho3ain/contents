import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { BuyerEventInput } from './buyer-events';
import { insertBuyerEvent } from './interest-scoring';

/**
 * M12 — the single recorder of buyer behaviour events (+ the M11 interest
 * profile they feed). Dependency-free (DataSource only) so commerce,
 * engagement, follows and the public catalogue can all log events without
 * circular imports. Logging must NEVER break a user action: use recordSafe.
 */
@Injectable()
export class BuyerEventsService {
  private readonly logger = new Logger(BuyerEventsService.name);

  constructor(private readonly dataSource: DataSource) {}

  async record(
    input: BuyerEventInput,
    manager?: EntityManager,
  ): Promise<boolean> {
    return insertBuyerEvent(manager ?? this.dataSource, input);
  }

  async recordSafe(
    input: BuyerEventInput,
    manager?: EntityManager,
  ): Promise<boolean> {
    try {
      return await this.record(input, manager);
    } catch (error) {
      this.logger.warn(
        `Failed to record buyer event ${input.type}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
