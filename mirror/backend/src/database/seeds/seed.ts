import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { seedBlogDemo } from './seed-blog-demo';
import { seedCrmReferenceData } from './seed-crm-reference';
import { randomUUID } from 'crypto';
import { User, UserRole, UserStatus } from '../entities/identity/user.entity';
import {
  CreatorProfile,
  CreatorProfileStatus,
  CreatorVerificationStatus,
} from '../entities/identity/creator-profile.entity';
import { Category, CategoryStatus } from '../entities/catalog/category.entity';
import { Permission } from '../entities/catalog/permission.entity';
import { Integration } from '../entities/catalog/integration.entity';
import {
  Agent,
  AgentRiskLevel,
  AgentStatus,
} from '../entities/agents/agent.entity';
import {
  AgentVersion,
  AgentVersionStatus,
} from '../entities/agents/agent-version.entity';
import { AgentCategory } from '../entities/agents/agent-category.entity';
import { AgentIndustry } from '../entities/agents/agent-industry.entity';
import { Industry } from '../entities/catalog/industry.entity';
import { AgentPermission } from '../entities/agents/agent-permission.entity';
import { AgentIntegration } from '../entities/agents/agent-integration.entity';
import {
  AgentRequirement,
  AgentRequirementType,
} from '../entities/agents/agent-requirement.entity';
import { AgentDataPolicy } from '../entities/agents/agent-data-policy.entity';
import { deriveUsageModel } from '../entities/agents/product-model';
import {
  AgentVerification,
  AgentVerificationStatus,
  AgentVerificationType,
} from '../entities/agents/agent-verification.entity';
import { Order, OrderStatus } from '../entities/commerce/order.entity';
import { OrderItem } from '../entities/commerce/order-item.entity';
import { Payment, PaymentStatus } from '../entities/commerce/payment.entity';
import {
  Entitlement,
  EntitlementStatus,
} from '../entities/commerce/entitlement.entity';
import { Review, ReviewStatus } from '../entities/reviews/review.entity';
import { ReviewReply } from '../entities/reviews/review-reply.entity';
import {
  SecurityReview,
  SecurityReviewVerdict,
} from '../entities/trust/security-review.entity';
import { SecurityReviewItem } from '../entities/trust/security-review-item.entity';
import { SECURITY_CHECKLIST } from '../entities/trust/security-checklist';
import {
  CATEGORY_SEED,
  DEMO_AGENTS,
  DEMO_BUYERS,
  DEMO_CREATOR,
  INTEGRATION_SEED,
  PERMISSION_SEED,
} from './seed-data';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Canonical development admin phone (phone-primary auth). Mirrors the
 * 1756600000000-phone-primary-auth migration so fresh seeds and upgraded
 * databases agree on the same test credential set.
 */
export const SEED_ADMIN_PHONE = '+989120000001';

export interface SeedSummary {
  adminCreated: boolean;
  categoriesCreated: number;
  /** Taxonomy v2 — demo agent↔industry links added by this run (idempotent). */
  demoIndustriesLinked: number;
  /** Demo blog articles written by this run (0 when posts already exist). */
  demoBlogPostsCreated: number;
  permissionsCreated: number;
  integrationsCreated: number;
  demoCreated: boolean;
}

export type AdminBootstrap =
  | { kind: 'create'; email: string; password: string }
  | { kind: 'skip'; reason: string };

/**
 * Decides whether the seed may bootstrap an admin account
 * (Pre-Owner Audit — Developer Access hardening).
 *
 * Outside production the documented development credential (or the
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD overrides) is used. In production
 * the seed NEVER creates a well-known credential: an admin is bootstrapped
 * only when the operator provides BOTH SEED_ADMIN_EMAIL and
 * SEED_ADMIN_PASSWORD explicitly — there is no default password in
 * production, so `npm run seed` against a production database can never
 * open a backdoor account.
 */
export function resolveAdminBootstrap(
  env: NodeJS.ProcessEnv = process.env,
): AdminBootstrap {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const email = (env.SEED_ADMIN_EMAIL ?? '').toLowerCase().trim();
  const password = env.SEED_ADMIN_PASSWORD ?? '';
  if (nodeEnv === 'production') {
    if (!email || !password) {
      return {
        kind: 'skip',
        reason:
          'production never seeds a default-password admin; set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD explicitly to bootstrap one',
      };
    }
    return { kind: 'create', email, password };
  }
  return {
    kind: 'create',
    email: email || 'admin@agenthub.dev',
    password: password || 'Admin@1234',
  };
}

/**
 * Seeds reference data always, and demo marketplace content unless running
 * in production. Re-running is safe: everything is skipped when present.
 */
export async function seedDatabase(
  dataSource: DataSource,
): Promise<SeedSummary> {
  const summary: SeedSummary = {
    adminCreated: false,
    categoriesCreated: 0,
    demoIndustriesLinked: 0,
    demoBlogPostsCreated: 0,
    permissionsCreated: 0,
    integrationsCreated: 0,
    demoCreated: false,
  };

  const users = dataSource.getRepository(User);
  const categories = dataSource.getRepository(Category);
  const permissions = dataSource.getRepository(Permission);
  const integrations = dataSource.getRepository(Integration);

  // -------- Admin (Developer Access — see docs/DEVELOPER_ACCESS_FA.md) --------
  const adminBootstrap = resolveAdminBootstrap();
  if (adminBootstrap.kind === 'skip') {
    console.log(`[seed] admin bootstrap skipped: ${adminBootstrap.reason}`);
  } else {
    const adminEmail = adminBootstrap.email;
    const existingAdmin = await users.findOneBy({ email: adminEmail });
    if (!existingAdmin) {
      await users.save(
        users.create({
          email: adminEmail,
          // Phone-primary auth: the bootstrap admin gets the canonical
          // development phone so it can sign in with phone + password
          // (mirrors the 1756600000000-phone-primary-auth migration).
          phone: SEED_ADMIN_PHONE,
          username: 'admin',
          fullName: 'MESH Admin',
          country: 'DE',
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          onboardingCompletedAt: new Date(),
          termsAcceptedAt: new Date(),
          passwordHash: await bcrypt.hash(adminBootstrap.password, 12),
        }),
      );
      summary.adminCreated = true;
      console.log(`[seed] admin created: ${adminEmail}`);
    }
    // Phase 3: the bootstrap admin holds an EXPLICIT SUPER_ADMIN assignment
    // (idempotent). Without it the account would only work through the
    // legacy-admin fallback, which excludes impersonation and kill switches.
    await dataSource.query(
      `INSERT INTO admin_role_assignments (user_id, admin_role, reason)
       SELECT u.id, 'SUPER_ADMIN', 'Bootstrap administrator (seed)'
         FROM users u
        WHERE u.email = $1
          AND NOT EXISTS (
            SELECT 1 FROM admin_role_assignments a
             WHERE a.user_id = u.id AND a.admin_role = 'SUPER_ADMIN' AND a.revoked_at IS NULL)`,
      [adminEmail],
    );
  }

  // -------- Reference data --------
  for (const seed of CATEGORY_SEED) {
    const existing = await categories.findOneBy({ slug: seed.slug });
    if (existing) continue;
    await categories.save(
      categories.create({ ...seed, status: CategoryStatus.ACTIVE }),
    );
    summary.categoriesCreated += 1;
  }

  for (const seed of PERMISSION_SEED) {
    const existing = await permissions.findOneBy({ code: seed.code });
    if (existing) continue;
    await permissions.save(permissions.create({ ...seed }));
    summary.permissionsCreated += 1;
  }

  for (const seed of INTEGRATION_SEED) {
    const existing = await integrations.findOneBy({ slug: seed.slug });
    if (existing) continue;
    await integrations.save(integrations.create({ ...seed }));
    summary.integrationsCreated += 1;
  }

  // -------- Demo marketplace content (never in production) --------
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const allowDemo = nodeEnv !== 'production' || process.env.SEED_DEMO === '1';
  // seedDemo hard-requires an existing admin row (findOneByOrFail below);
  // when the admin bootstrap was skipped (production without explicit
  // credentials) there is nothing to attribute demo content to.
  const demoAdminEmail =
    adminBootstrap.kind === 'create' ? adminBootstrap.email : null;

  // Phase C1 — the CRM reference data (tag vocabulary, system segments and
  // the default saved views) is PRODUCT data, not demo data: the admin CRM
  // needs it in every environment, production included. It contains only
  // labels and rule documents — no credential, no personal data.
  await seedCrmReferenceData(dataSource);

  if (
    allowDemo &&
    demoAdminEmail &&
    !(await users.findOneBy({ email: DEMO_CREATOR.email }))
  ) {
    await seedDemo(dataSource, demoAdminEmail);
    summary.demoCreated = true;
  } else if (!allowDemo) {
    console.log('[seed] demo content skipped: NODE_ENV=production');
  } else if (!demoAdminEmail) {
    console.log(
      '[seed] demo content skipped: no admin bootstrapped (production requires SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD)',
    );
  }

  // Taxonomy v2 — the DEMO agents gain their industries even on databases
  // seeded before the industries table existed. Idempotent (missing links
  // only, never deletes), demo products only, never in production.
  if (allowDemo) {
    summary.demoIndustriesLinked = await syncDemoIndustries(dataSource);
  }

  // Demo blog — a handful of published articles so `/blog` is not an empty
  // state on every fresh checkout. Idempotent (skipped when any post
  // exists), attributed to the bootstrap admin, never in production.
  if (allowDemo && demoAdminEmail) {
    const blog = await seedBlogDemo(dataSource, demoAdminEmail);
    summary.demoBlogPostsCreated = blog.posts;
  }

  return summary;
}

/**
 * Links each demo agent (matched by slug AND demo creator) to the industries
 * declared in `DEMO_AGENTS`. Rows that already exist are left untouched, so
 * re-running the seed never duplicates or removes anything; real products
 * (other creators) are never touched.
 */
async function syncDemoIndustries(dataSource: DataSource): Promise<number> {
  const creatorUser = await dataSource
    .getRepository(User)
    .findOneBy({ email: DEMO_CREATOR.email });
  if (!creatorUser) return 0;
  const creatorProfile = await dataSource
    .getRepository(CreatorProfile)
    .findOneBy({ userId: creatorUser.id });
  if (!creatorProfile) return 0;
  const industryBySlug = new Map(
    (await dataSource.getRepository(Industry).find()).map((i) => [i.slug, i]),
  );
  let linked = 0;
  for (const seed of DEMO_AGENTS) {
    if (!seed.industries?.length) continue;
    const agent = await dataSource
      .getRepository(Agent)
      .findOneBy({ slug: seed.slug, creatorId: creatorProfile.id });
    if (!agent) continue;
    for (const slug of seed.industries.slice(0, 3)) {
      const industry = industryBySlug.get(slug);
      if (!industry) continue;
      const result = await dataSource.query<Array<{ agent_id: string }>>(
        `INSERT INTO agent_industries (agent_id, industry_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING agent_id`,
        [agent.id, industry.id],
      );
      linked += result.length;
    }
  }
  if (linked > 0) {
    console.log(`[seed] demo industries linked: ${linked}`);
  }
  return linked;
}

async function seedDemo(
  dataSource: DataSource,
  adminEmail: string,
): Promise<void> {
  const admin = await dataSource
    .getRepository(User)
    .findOneByOrFail({ email: adminEmail });

  // -------- Creator --------
  const creatorUser = await dataSource.getRepository(User).save(
    dataSource.getRepository(User).create({
      email: DEMO_CREATOR.email,
      phone: DEMO_CREATOR.phone,
      username: DEMO_CREATOR.username,
      fullName: DEMO_CREATOR.displayName,
      country: 'DE',
      role: UserRole.CREATOR,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      termsAcceptedAt: new Date(),
      passwordHash: await bcrypt.hash(DEMO_CREATOR.password, 12),
    }),
  );
  const creatorProfile = await dataSource.getRepository(CreatorProfile).save(
    dataSource.getRepository(CreatorProfile).create({
      userId: creatorUser.id,
      slug: DEMO_CREATOR.slug,
      displayName: DEMO_CREATOR.displayName,
      bio: DEMO_CREATOR.bio,
      expertise: DEMO_CREATOR.expertise,
      status: CreatorProfileStatus.APPROVED,
      verificationStatus: CreatorVerificationStatus.VERIFIED,
      verifiedAt: new Date(Date.now() - 40 * DAY_MS),
      approvedAt: new Date(Date.now() - 40 * DAY_MS),
      // Established demo studio (Creator Foundation): its field of activity
      // mirrors its agents' categories, and it has long finished the guided
      // onboarding — exactly what the migration backfills for real creators.
      activityAreas: [...new Set(DEMO_AGENTS.map((agent) => agent.category))],
      onboardingStep: 'submission',
      onboardingCompletedAt: new Date(Date.now() - 40 * DAY_MS),
    }),
  );

  // -------- Buyers --------
  const buyers = await Promise.all(
    DEMO_BUYERS.map(async (buyerSeed) =>
      dataSource.getRepository(User).save(
        dataSource.getRepository(User).create({
          email: buyerSeed.email,
          phone: buyerSeed.phone,
          username: buyerSeed.username,
          fullName: `${buyerSeed.username} Demo`,
          country: 'DE',
          role: UserRole.BUYER,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          onboardingCompletedAt: new Date(),
          termsAcceptedAt: new Date(),
          passwordHash: await bcrypt.hash(buyerSeed.password, 12),
        }),
      ),
    ),
  );

  const categoryBySlug = new Map(
    (await dataSource.getRepository(Category).find()).map((c) => [c.slug, c]),
  );
  const permissionByCode = new Map(
    (await dataSource.getRepository(Permission).find()).map((p) => [p.code, p]),
  );
  const integrationBySlug = new Map(
    (await dataSource.getRepository(Integration).find()).map((i) => [
      i.slug,
      i,
    ]),
  );
  const industryBySlug = new Map(
    (await dataSource.getRepository(Industry).find()).map((i) => [i.slug, i]),
  );

  const agentBySlug = new Map<string, Agent>();
  const versionByAgent = new Map<string, AgentVersion>();

  // -------- Agents, versions, verification, security review --------
  for (const seed of DEMO_AGENTS) {
    const publishedAt = new Date(Date.now() - seed.publishedDaysAgo * DAY_MS);
    const agent = await dataSource.getRepository(Agent).save(
      dataSource.getRepository(Agent).create({
        creatorId: creatorProfile.id,
        name: seed.name,
        slug: seed.slug,
        shortDescription: seed.shortDescription,
        fullDescription: seed.fullDescription,
        capabilities: seed.capabilities,
        limitations: seed.limitations,
        demoUrl: seed.demoUrl,
        keywords: seed.keywords ?? [],
        useCases: seed.useCases ?? [],
        price: seed.price,
        currency: 'IRR',
        isFree: seed.isFree,
        status: AgentStatus.PUBLISHED,
        riskLevel: seed.riskLevel as AgentRiskLevel,
        // Product Contract (§5–§20) — the published declaration.
        productType: seed.productContract.productType,
        buildTool: seed.productContract.buildTool,
        buildToolDetail: seed.productContract.buildToolDetail,
        deliveryModel: seed.productContract.deliveryModel,
        executionModel: seed.productContract.executionModel,
        hostingResponsibility: seed.productContract.hostingResponsibility,
        whatBuyerReceives: seed.productContract.whatBuyerReceives,
        whatBuyerDoesNotReceive: seed.productContract.whatBuyerDoesNotReceive,
        additionalCosts: seed.productContract.additionalCosts,
        usageModel: deriveUsageModel(seed.isFree),
        supportOwner: seed.productContract.supportOwner,
        supportScope: seed.productContract.supportScope,
        supportPeriod: seed.productContract.supportPeriod,
        publishedAt,
      }),
    );
    agentBySlug.set(seed.slug, agent);

    const category = categoryBySlug.get(seed.category);
    if (category) {
      await dataSource.getRepository(AgentCategory).save(
        dataSource.getRepository(AgentCategory).create({
          agentId: agent.id,
          categoryId: category.id,
        }),
      );
    }
    for (const industrySlug of (seed.industries ?? []).slice(0, 3)) {
      const industry = industryBySlug.get(industrySlug);
      if (!industry) continue;
      await dataSource
        .getRepository(AgentIndustry)
        .save(
          dataSource
            .getRepository(AgentIndustry)
            .create({ agentId: agent.id, industryId: industry.id }),
        );
    }

    const version = await dataSource.getRepository(AgentVersion).save(
      dataSource.getRepository(AgentVersion).create({
        agentId: agent.id,
        versionNumber: '1.0.0',
        changeSummary: 'Initial release',
        status: AgentVersionStatus.PUBLISHED,
        publishedAt,
      }),
    );
    versionByAgent.set(agent.id, version);
    await dataSource
      .getRepository(Agent)
      .update(agent.id, { publishedVersionId: version.id });

    for (const permissionSeed of seed.permissions) {
      const permission = permissionByCode.get(permissionSeed.code);
      if (!permission) continue;
      await dataSource.getRepository(AgentPermission).save(
        dataSource.getRepository(AgentPermission).create({
          agentId: agent.id,
          permissionId: permission.id,
          reason: permissionSeed.reason,
          required: permissionSeed.required,
        }),
      );
    }

    for (const integrationSeed of seed.integrations) {
      const integration = integrationBySlug.get(integrationSeed.slug);
      if (!integration) continue;
      await dataSource.getRepository(AgentIntegration).save(
        dataSource.getRepository(AgentIntegration).create({
          agentId: agent.id,
          integrationId: integration.id,
          purpose: integrationSeed.purpose,
        }),
      );
    }

    for (const requirement of seed.requirements) {
      await dataSource.getRepository(AgentRequirement).save(
        dataSource.getRepository(AgentRequirement).create({
          agentId: agent.id,
          type: requirement.type as AgentRequirementType,
          description: requirement.description,
          required: requirement.required,
        }),
      );
    }

    await dataSource.getRepository(AgentDataPolicy).save(
      dataSource.getRepository(AgentDataPolicy).create({
        agentId: agent.id,
        ...seed.dataPolicy,
      }),
    );

    if (seed.listingReviewed) {
      const securityReview = await dataSource
        .getRepository(SecurityReview)
        .save(
          dataSource.getRepository(SecurityReview).create({
            agentId: agent.id,
            reviewerId: admin.id,
            verdict: SecurityReviewVerdict.PASSED,
            notes: 'Checklist completed during initial listing review.',
          }),
        );
      const reviewItems = dataSource.getRepository(SecurityReviewItem);
      for (const item of SECURITY_CHECKLIST) {
        await reviewItems.save(
          reviewItems.create({
            securityReviewId: securityReview.id,
            itemKey: item.key,
            passed: true,
            note: null,
          }),
        );
      }
      await dataSource.getRepository(AgentVerification).save(
        dataSource.getRepository(AgentVerification).create({
          agentId: agent.id,
          verificationType: AgentVerificationType.LISTING_REVIEWED,
          status: AgentVerificationStatus.GRANTED,
          reviewedBy: admin.id,
          grantedAt: publishedAt,
          note: 'Passed initial security review',
        }),
      );
    }
  }

  // -------- Demo purchases --------
  // Paid agents flow through Order -> Payment -> Entitlement (with a full
  // historical snapshot). The free agent is granted an entitlement directly —
  // no zero-value order is created.
  interface PurchaseSeed {
    buyerIndex: number;
    agentSlug: string;
    rating?: { value: number; text: string };
  }

  const purchases: PurchaseSeed[] = [
    {
      buyerIndex: 0,
      agentSlug: 'support-copilot',
      rating: {
        value: 5,
        text: 'Set it up in an afternoon and it immediately cut our first-response time. Replies are well-written and always cite the knowledge base, which my team actually checks now. The escalation flow is the standout feature.',
      },
    },
    {
      buyerIndex: 0,
      agentSlug: 'sheet-whisperer',
      rating: {
        value: 4,
        text: 'Great for quick analysis questions. Occasionally the formula it writes needs a small tweak, but the explanations make fixing it easy.',
      },
    },
    {
      buyerIndex: 1,
      agentSlug: 'support-copilot',
      rating: {
        value: 4,
        text: 'Solid triage quality and the weekly themes report is genuinely useful for planning. Drafts sometimes over-explain simple tickets, but that is easy to tune.',
      },
    },
    {
      buyerIndex: 1,
      agentSlug: 'onboardflow',
      rating: {
        value: 5,
        text: 'Our HR and IT teams finally run the same checklist. Blocker alerts surface real problems before the first week is over.',
      },
    },
  ];

  for (const purchase of purchases) {
    const agent = agentBySlug.get(purchase.agentSlug);
    const buyer = buyers[purchase.buyerIndex];
    if (!agent || !buyer) continue;

    const paidDaysAgo = 9 - purchase.buyerIndex * 2;
    const paidAt = new Date(Date.now() - paidDaysAgo * DAY_MS);
    const version = versionByAgent.get(agent.id);

    if (agent.isFree) {
      // Free flow: entitlement directly (no order/payment).
      await dataSource.getRepository(Entitlement).save(
        dataSource.getRepository(Entitlement).create({
          userId: buyer.id,
          agentId: agent.id,
          agentVersionId: version?.id ?? null,
          orderId: null,
          status: EntitlementStatus.GRANTED,
          grantedAt: paidAt,
        }),
      );
    } else {
      const order = await dataSource.getRepository(Order).save(
        dataSource.getRepository(Order).create({
          buyerId: buyer.id,
          status: OrderStatus.FULFILLED,
          amount: agent.price,
          currency: 'IRR',
          paidAt,
          fulfilledAt: new Date(paidAt.getTime() + 5 * 60 * 1000),
        }),
      );

      await dataSource.getRepository(OrderItem).save(
        dataSource.getRepository(OrderItem).create({
          orderId: order.id,
          agentId: agent.id,
          agentVersionId: version?.id ?? null,
          agentNameSnapshot: agent.name,
          agentSlugSnapshot: agent.slug,
          agentVersionSnapshot: version?.versionNumber ?? '1.0.0',
          creatorIdSnapshot: creatorProfile.id,
          unitPrice: agent.price,
          currencyCode: 'IRR',
          quantity: 1,
          total: agent.price,
          isFree: false,
        }),
      );

      await dataSource.getRepository(Payment).save(
        dataSource.getRepository(Payment).create({
          orderId: order.id,
          gateway: 'demo',
          gatewayTransactionId: `demo-${randomUUID()}`,
          amount: agent.price,
          currency: 'IRR',
          status: PaymentStatus.SUCCESSFUL,
          confirmedAt: paidAt,
          providerPayload: { seeded: true },
        }),
      );

      await dataSource.getRepository(Entitlement).save(
        dataSource.getRepository(Entitlement).create({
          userId: buyer.id,
          agentId: agent.id,
          agentVersionId: version?.id ?? null,
          orderId: order.id,
          status: EntitlementStatus.GRANTED,
          grantedAt: new Date(paidAt.getTime() + 5 * 60 * 1000),
        }),
      );
    }

    if (purchase.rating) {
      const review = await dataSource.getRepository(Review).save(
        dataSource.getRepository(Review).create({
          userId: buyer.id,
          agentId: agent.id,
          orderId: agent.isFree ? null : undefined,
          rating: purchase.rating.value,
          text: purchase.rating.text,
          status: ReviewStatus.PUBLISHED,
        }),
      );
      if (
        purchase.agentSlug === 'support-copilot' &&
        purchase.buyerIndex === 0
      ) {
        await dataSource.getRepository(ReviewReply).save(
          dataSource.getRepository(ReviewReply).create({
            reviewId: review.id,
            creatorId: creatorUser.id,
            body: 'Thank you! We are working on a tone control setting so teams can tune reply style — it is next on the roadmap.',
          }),
        );
      }
    }
  }

  console.log(
    '[seed] demo marketplace created: creator, 4 agents (published versions + snapshots), 2 buyers, paid orders, free entitlement, reviews',
  );
}
