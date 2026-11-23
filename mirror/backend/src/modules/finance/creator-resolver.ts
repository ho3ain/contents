import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';

/** Maps the authenticated user to their creator profile (the money owner). */
@Injectable()
export class CreatorResolver {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async creatorIdOfUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<string> {
    const rows = await (manager ?? this.dataSource.manager).query<
      Array<{ id: string }>
    >(`SELECT id FROM creator_profiles WHERE user_id = $1`, [userId]);
    if (!rows[0]) {
      throw new ApiException(
        'FORBIDDEN',
        'A creator profile is required',
        HttpStatus.FORBIDDEN,
      );
    }
    return rows[0].id;
  }

  async userIdOfCreator(
    creatorId: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const rows = await (manager ?? this.dataSource.manager).query<
      Array<{ user_id: string }>
    >(`SELECT user_id FROM creator_profiles WHERE id = $1`, [creatorId]);
    return rows[0]?.user_id ?? null;
  }
}
