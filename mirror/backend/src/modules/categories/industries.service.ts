import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryStatus } from '../../database/entities/catalog/category.entity';
import { Industry } from '../../database/entities/catalog/industry.entity';
import { AgentIndustry } from '../../database/entities/agents/agent-industry.entity';
import { AgentStatus } from '../../database/entities/agents/agent.entity';

export interface IndustryWithCount {
  id: string;
  name: string;
  nameFa: string | null;
  slug: string;
  descriptionFa: string | null;
  aliases: string[];
  sortOrder: number;
  agentCount: number;
}

@Injectable()
export class IndustriesService {
  constructor(
    @InjectRepository(Industry)
    private readonly industriesRepository: Repository<Industry>,
    @InjectRepository(AgentIndustry)
    private readonly agentIndustriesRepository: Repository<AgentIndustry>,
  ) {}

  /** Active industries with the number of published agents in each. */
  async listActive(): Promise<IndustryWithCount[]> {
    const industries = await this.industriesRepository.find({
      where: { status: CategoryStatus.ACTIVE },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const counts = await this.agentIndustriesRepository
      .createQueryBuilder('ai')
      .innerJoin(
        'agents',
        'agent',
        'agent.id = ai.agent_id AND agent.status = :status',
        { status: AgentStatus.PUBLISHED },
      )
      .select('ai.industry_id', 'industryId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ai.industry_id')
      .getRawMany<{ industryId: string; count: string }>();
    const byIndustry = new Map(
      counts.map((row) => [row.industryId, Number(row.count)]),
    );
    return industries.map((industry) => ({
      id: industry.id,
      name: industry.name,
      nameFa: industry.nameFa,
      slug: industry.slug,
      descriptionFa: industry.descriptionFa,
      aliases: industry.aliases ?? [],
      sortOrder: industry.sortOrder,
      agentCount: byIndustry.get(industry.id) ?? 0,
    }));
  }
}
