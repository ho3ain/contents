import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { EvaluationPolicy } from '../../database/entities/evaluation/evaluation-policy.entity';
import { EVALUATION_CATALOG_VERSION } from './domain/evaluation-domain';
import {
  BASELINE_EVALUATION_POLICY_KEY,
  isPolicyDefinition,
} from './domain/evaluation-policy';

@Injectable()
export class EvaluationPolicyService {
  constructor(
    @InjectRepository(EvaluationPolicy)
    private readonly policies: Repository<EvaluationPolicy>,
  ) {}

  async active(): Promise<EvaluationPolicy> {
    const policy = await this.policies.findOne({
      where: { policyKey: BASELINE_EVALUATION_POLICY_KEY },
      order: { version: 'DESC' },
    });
    if (!policy || !isPolicyDefinition(policy.definition)) {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'No valid evaluation policy is installed',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (
      policy.catalogVersion !== EVALUATION_CATALOG_VERSION ||
      policy.definition.catalogVersion !== EVALUATION_CATALOG_VERSION
    ) {
      throw new ApiException(
        'SERVICE_UNAVAILABLE',
        'The active evaluation policy is not supported by this evaluator build',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return policy;
  }

  async list(): Promise<
    Array<
      Pick<
        EvaluationPolicy,
        'id' | 'policyKey' | 'version' | 'catalogVersion' | 'createdAt'
      >
    >
  > {
    const policies = await this.policies.find({
      where: { policyKey: BASELINE_EVALUATION_POLICY_KEY },
      order: { version: 'DESC' },
    });
    return policies.map(
      ({ id, policyKey, version, catalogVersion, createdAt }) => ({
        id,
        policyKey,
        version,
        catalogVersion,
        createdAt,
      }),
    );
  }
}
