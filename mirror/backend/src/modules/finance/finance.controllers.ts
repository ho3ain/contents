import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../../database/entities/identity/user.entity';
import {
  PageParamPipe,
  PageSizeParamPipe,
} from '../../common/validation/page-params.pipe';
import { BankAccountsService } from './bank-accounts.service';
import { CreatorResolver } from './creator-resolver';
import {
  AddBankAccountDto,
  AdvanceReconciliationDto,
  DisbursementDto,
  ImportReconciliationDto,
  MarkPaidDto,
  OptionalReasonDto,
  PublishPolicyDto,
  RebuildBalanceDto,
  RecordUsageCostDto,
  ReasonDto,
  RequestPayoutDto,
  ResolveExceptionDto,
  ReverseLedgerDto,
  SetUsagePolicyDto,
  StatementQueryDto,
  SubmitKycDto,
} from './dto/finance.dto';
import { POLICY_KINDS, PolicyKind } from './domain/policy';
import { actorFromUser } from './finance-actor';
import { FinanceAdminService } from './finance-admin.service';
import { FinanceClock } from './finance-clock';
import { FinancialHoldsService } from './financial-holds.service';
import { IntegrityService } from './integrity.service';
import { KycService } from './kyc.service';
import { PayoutsService } from './payouts.service';
import { PolicyService } from './policy.service';
import { ReceiptsService } from './receipts.service';
import { ReconciliationService, ReconClass } from './reconciliation.service';
import { RefundSettlementService } from './refund-settlement.service';
import { ReleaseService } from './release.service';
import { StatementsService } from './statements.service';
import { UsageMeteringService } from './usage-metering.service';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { RequiresCapability } from '../control-plane/config/kill-switch.guard';

const asDate = (value?: string) => (value ? new Date(value) : undefined);

/** Phase 2 — the creator's own money: balance, statement, payouts, KYC, bank account. */
@ApiTags('creator-finance')
@ApiBearerAuth()
@Roles(UserRole.CREATOR)
@Controller('creators/me/finance')
export class CreatorFinanceController {
  constructor(
    private readonly statements: StatementsService,
    private readonly payouts: PayoutsService,
    private readonly kyc: KycService,
    private readonly banks: BankAccountsService,
    private readonly creators: CreatorResolver,
    private readonly usage: UsageMeteringService,
  ) {}

  @Get('balance')
  @ApiOperation({
    summary:
      'Held / available / payout-pending / paid / recovery — derived from the ledger',
  })
  balance(@CurrentUser() user: AuthUser) {
    return this.statements.creatorBalance(user.id);
  }

  @Get('statement')
  @ApiOperation({ summary: 'Ledger-derived statement lines of the creator' })
  async statement(
    @CurrentUser() user: AuthUser,
    @Query() q: StatementQueryDto,
  ) {
    const creatorId = await this.creators.creatorIdOfUser(user.id);
    return this.statements.lines(creatorId, {
      from: asDate(q.from),
      to: asDate(q.to),
      limit: q.limit,
      offset: q.offset,
    });
  }

  @Get('statement.csv')
  @ApiOperation({ summary: 'Statement as CSV (formula-injection safe)' })
  async statementCsv(
    @CurrentUser() user: AuthUser,
    @Query() q: StatementQueryDto,
    @Res() res: Response,
  ) {
    const creatorId = await this.creators.creatorIdOfUser(user.id);
    // Headers are set only on success, so an error keeps the JSON envelope.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="mesh-statement.csv"',
    );
    res.send(
      await this.statements.creatorStatementCsv(creatorId, {
        from: asDate(q.from),
        to: asDate(q.to),
      }),
    );
  }

  @Get('payouts')
  @ApiOperation({ summary: 'My payouts' })
  list(@CurrentUser() user: AuthUser) {
    return this.payouts.listForCreator(user.id);
  }

  @Get('payouts/eligibility')
  @ApiOperation({
    summary: 'Can I request a payout now, and if not, why and until when',
  })
  eligibility(@CurrentUser() user: AuthUser) {
    return this.payouts.eligibilityForCreator(user.id);
  }

  @Post('payouts')
  @RequiresCapability('PAYOUTS_ENABLED')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Request a payout (idempotent; funds are reserved immediately)',
  })
  request(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestPayoutDto,
    @Req() req: Request,
  ) {
    return this.payouts.requestManual(actorFromUser(user, req), {
      amount: dto.amount,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Post('payouts/:id/cancel')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel my payout while it is still waiting for review',
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.payouts.cancel(actorFromUser(user, req), id, dto.reason);
  }

  @Get('kyc')
  @ApiOperation({ summary: 'My KYC status' })
  kycStatus(@CurrentUser() user: AuthUser) {
    return this.kyc.getForCreator(user.id);
  }

  @Post('kyc')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit (or resubmit) identity data for review' })
  submitKyc(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitKycDto,
    @Req() req: Request,
  ) {
    return this.kyc.submit(actorFromUser(user, req), dto);
  }

  @Get('bank-account')
  @ApiOperation({ summary: 'My payout bank account (masked)' })
  bank(@CurrentUser() user: AuthUser) {
    return this.banks.activeForCreator(user.id);
  }

  @Get('usage-summary')
  @ApiOperation({
    summary:
      'My normalized Runtime usage, cost-attribution state and net-sales calculation evidence',
  })
  usageSummary(@CurrentUser() user: AuthUser) {
    return this.usage.creatorSummary(user.id);
  }

  @Get('usage-policies')
  @ApiOperation({
    summary:
      'My active creator usage limits (enforced only by MESH Runtime gateway paths)',
  })
  usagePolicies(@CurrentUser() user: AuthUser) {
    return this.usage.listCreatorPolicies(user.id);
  }

  @Post('usage-policies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Publish a new immutable creator usage-policy version for one owned product',
  })
  setUsagePolicy(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetUsagePolicyDto,
    @Req() req: Request,
  ) {
    return this.usage.setCreatorPolicy(user.id, actorFromUser(user, req), dto);
  }

  @Post('bank-account')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Register / replace my payout bank account (Shaba)',
  })
  addBank(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddBankAccountDto,
    @Req() req: Request,
  ) {
    return this.banks.add(actorFromUser(user, req), dto);
  }
}

/** Buyer-facing internal receipts (NOT tax invoices). */
@ApiTags('receipts')
@ApiBearerAuth()
@Roles(UserRole.BUYER, UserRole.CREATOR)
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  @ApiOperation({
    summary: 'My internal payment/refund receipts (not tax invoices)',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.receipts.listForBuyer(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my internal receipts' })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.receipts.getForBuyer(user.id, id);
  }
}

/** Phase 2 — the finance back office. */
@ApiTags('admin-finance')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(
    private readonly statements: StatementsService,
    private readonly integrity: IntegrityService,
    private readonly policies: PolicyService,
    private readonly payouts: PayoutsService,
    private readonly kyc: KycService,
    private readonly banks: BankAccountsService,
    private readonly holds: FinancialHoldsService,
    private readonly recon: ReconciliationService,
    private readonly refunds: RefundSettlementService,
    private readonly admin: FinanceAdminService,
    private readonly receipts: ReceiptsService,
    private readonly release: ReleaseService,
    private readonly usage: UsageMeteringService,
    private readonly clock: FinanceClock,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ---- overview ---------------------------------------------------------
  @Get('dashboard')
  @ApiOperation({
    summary: 'Finance dashboard: liabilities, commission, fees, open work',
  })
  dashboard() {
    return this.statements.dashboard();
  }

  @Get('trial-balance')
  @ApiOperation({ summary: 'Σ debits / Σ credits per ledger account' })
  trialBalance() {
    return this.statements.trialBalance();
  }

  @Get('integrity')
  @ApiOperation({
    summary: 'Run the ledger integrity checker (read-only, one snapshot)',
  })
  integrityReport() {
    return this.integrity.run();
  }

  @Get('audit')
  @ApiOperation({ summary: 'Financial audit trail (append-only)' })
  auditTrail(
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
    @Query('page', PageParamPipe) page = 1,
    @Query('pageSize', new PageSizeParamPipe(50, 200)) pageSize = 50,
  ) {
    return this.statements.financialAudit({
      targetType,
      targetId,
      action,
      limit: Number(pageSize),
      offset: (Number(page) - 1) * Number(pageSize),
    });
  }

  // ---- Phase 4 usage / cost attribution -----------------------------------
  @Get('usage-summary')
  @ApiOperation({
    summary:
      'Platform usage/cost attribution overview; unknown and disputed remain distinct',
  })
  usageSummary(@Query('creatorId') creatorId?: string) {
    return this.usage.adminSummary(creatorId);
  }

  @Post('usage-events/:id/costs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Append manual estimated/reconciled/disputed/unknown cost evidence; no creator deduction or payout occurs',
  })
  recordUsageCost(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RecordUsageCostDto,
    @Req() req: Request,
  ) {
    return this.usage.recordAdminCost(actorFromUser(user, req), {
      usageEventId: id,
      state: dto.state,
      amountMinor: dto.amountMinor,
      currency: dto.currency,
      priceReference: dto.priceReference,
      sourceReference: dto.sourceReference,
      idempotencyKey: dto.idempotencyKey,
      note: dto.note,
    });
  }

  // ---- policy -------------------------------------------------------------
  @Get('policies')
  @ApiOperation({
    summary:
      'Every policy version (commission, holding, refund, payout, KYC eligibility)',
  })
  async policyList(@Query('kind') kind?: string) {
    const k =
      kind && (POLICY_KINDS as readonly string[]).includes(kind)
        ? (kind as PolicyKind)
        : undefined;
    const rows = await this.policies.rows(undefined, k);
    return rows.map((r) => ({
      ...r,
      effectiveFrom: r.effectiveFrom.toISOString(),
      effectiveUntil: r.effectiveUntil?.toISOString() ?? null,
    }));
  }

  @Post('policies')
  @ApiOperation({
    summary: 'Publish a NEW policy version (never edits an old one; audited)',
  })
  async publishPolicy(
    @CurrentUser() user: AuthUser,
    @Body() dto: PublishPolicyDto,
    @Req() req: Request,
  ) {
    const row = await this.policies.publish(actorFromUser(user, req), {
      kind: dto.kind,
      params: dto.params,
      effectiveFrom: new Date(dto.effectiveFrom),
      reason: dto.reason,
      allowBackdate: dto.allowBackdate,
      note: dto.note,
    });
    return {
      ...row,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
    };
  }

  // ---- exceptions ---------------------------------------------------------
  @Get('exceptions')
  @ApiOperation({
    summary: 'Money events the engine could not map deterministically',
  })
  exceptions(
    @Query('status') status?: string,
    @Query('page', PageParamPipe) page = 1,
    @Query('pageSize', new PageSizeParamPipe(50, 200)) pageSize = 50,
  ) {
    return this.admin.exceptions(
      status === 'OPEN' || status === 'RESOLVED' ? status : undefined,
      Number(pageSize),
      (Number(page) - 1) * Number(pageSize),
    );
  }

  @Post('exceptions/:id/resolve')
  @HttpCode(HttpStatus.OK)
  resolveException(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveExceptionDto,
    @Req() req: Request,
  ) {
    return this.admin.resolveException(actorFromUser(user, req), id, dto.note);
  }

  // ---- ledger -------------------------------------------------------------
  @Get('ledger/transactions/:id')
  ledgerTransaction(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.ledgerTransaction(id);
  }

  @Post('ledger/transactions/:id/reverse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reverse a non-state-bearing ledger transaction (original is never edited)',
  })
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReverseLedgerDto,
    @Req() req: Request,
  ) {
    return this.admin.reverse(actorFromUser(user, req), id, dto.reason);
  }

  // ---- creators -------------------------------------------------------------
  @Get('creators/:creatorId/balance')
  creatorBalance(@Param('creatorId', new ParseUUIDPipe()) creatorId: string) {
    return this.statements.balanceView(creatorId);
  }

  @Get('creators/:creatorId/bank-account')
  @ApiOperation({
    summary:
      "The creator's active payout bank account, masked (plaintext only via the audited payout destination routes)",
  })
  creatorBankAccount(
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
  ) {
    return this.banks.activeViewForCreatorId(creatorId);
  }

  @Get('creators/:creatorId/statement')
  creatorStatement(
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
    @Query() q: StatementQueryDto,
  ) {
    return this.statements.lines(creatorId, {
      from: asDate(q.from),
      to: asDate(q.to),
      limit: q.limit,
      offset: q.offset,
    });
  }

  @Post('creators/:creatorId/balance/rebuild')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Recompute a creator balance from the ledger; optionally repair the projection',
  })
  rebuild(
    @CurrentUser() user: AuthUser,
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
    @Body() dto: RebuildBalanceDto,
    @Req() req: Request,
  ) {
    return this.admin.rebuildBalance(
      actorFromUser(user, req),
      creatorId,
      'IRR',
      dto,
    );
  }

  @Post('creators/:creatorId/hold')
  placeHold(
    @CurrentUser() user: AuthUser,
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.holds.place(actorFromUser(user, req), creatorId, dto.reason);
  }

  @Post('creators/:creatorId/hold/release')
  @HttpCode(HttpStatus.OK)
  releaseHold(
    @CurrentUser() user: AuthUser,
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.holds.release(actorFromUser(user, req), creatorId, dto.reason);
  }

  // ---- KYC --------------------------------------------------------------------
  @Get('kyc')
  kycList(
    @Query('state') state?: string,
    @Query('page', PageParamPipe) page = 1,
    @Query('pageSize', new PageSizeParamPipe(50, 200)) pageSize = 50,
  ) {
    const allowed = [
      'NOT_STARTED',
      'SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'SUSPENDED',
    ];
    return this.kyc.list(
      state && allowed.includes(state) ? (state as never) : undefined,
      Number(pageSize),
      (Number(page) - 1) * Number(pageSize),
    );
  }

  @Get('kyc/:creatorId')
  @ApiOperation({
    summary: 'KYC submission for review (decrypts; the read is audited)',
  })
  kycDetail(
    @CurrentUser() user: AuthUser,
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
    @Req() req: Request,
  ) {
    return this.kyc.reviewDetail(actorFromUser(user, req), creatorId);
  }

  @Post('kyc/:creatorId/start-review')
  @HttpCode(HttpStatus.OK)
  kycStart(
    @CurrentUser() user: AuthUser,
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
    @Body() dto: OptionalReasonDto,
    @Req() req: Request,
  ) {
    return this.kyc.startReview(
      actorFromUser(user, req),
      creatorId,
      dto.reason,
    );
  }

  @Post('kyc/:creatorId/approve')
  @HttpCode(HttpStatus.OK)
  kycApprove(
    @CurrentUser() user: AuthUser,
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
    @Body() dto: OptionalReasonDto,
    @Req() req: Request,
  ) {
    return this.kyc.approve(actorFromUser(user, req), creatorId, dto.reason);
  }

  @Post('kyc/:creatorId/reject')
  @HttpCode(HttpStatus.OK)
  kycReject(
    @CurrentUser() user: AuthUser,
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.kyc.reject(actorFromUser(user, req), creatorId, dto.reason);
  }

  @Post('kyc/:creatorId/suspend')
  @HttpCode(HttpStatus.OK)
  kycSuspend(
    @CurrentUser() user: AuthUser,
    @Param('creatorId', new ParseUUIDPipe()) creatorId: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.kyc.suspend(actorFromUser(user, req), creatorId, dto.reason);
  }

  // ---- bank accounts -------------------------------------------------------------
  @Post('bank-accounts/:id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin attestation of ownership (NOT a bank-side verification)',
  })
  verifyBank(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.banks.verifyOwnership(actorFromUser(user, req), id, dto.reason);
  }

  @Post('bank-accounts/:id/disable')
  @HttpCode(HttpStatus.OK)
  disableBank(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.banks.disable(actorFromUser(user, req), id, dto.reason);
  }

  // ---- payouts --------------------------------------------------------------------
  @Get('payouts')
  payoutList(
    @Query('status') status?: string,
    @Query('page', PageParamPipe) page = 1,
    @Query('pageSize', new PageSizeParamPipe(50, 200)) pageSize = 50,
  ) {
    const allowed = [
      'REQUESTED',
      'APPROVED',
      'PROCESSING',
      'PAID',
      'FAILED',
      'CANCELLED',
      'REJECTED',
    ];
    return this.payouts.listForAdmin(
      status && allowed.includes(status) ? (status as never) : undefined,
      Number(pageSize),
      (Number(page) - 1) * Number(pageSize),
    );
  }

  @Get('payouts/:id')
  payoutGet(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.payouts.getForAdmin(id);
  }

  @Post('payouts/:id/approve')
  @RequiresCapability('PAYOUTS_ENABLED')
  @HttpCode(HttpStatus.OK)
  payoutApprove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.payouts.approve(actorFromUser(user, req), id);
  }

  @Post('payouts/:id/start-processing')
  @RequiresCapability('PAYOUTS_ENABLED')
  @HttpCode(HttpStatus.OK)
  payoutStart(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.payouts.startProcessing(actorFromUser(user, req), id);
  }

  @Post('payouts/:id/destination')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reveal the full Shaba to perform the transfer (audited)',
  })
  payoutDestination(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.payouts.destinationForTransfer(actorFromUser(user, req), id);
  }

  @Post('payouts/:id/mark-paid')
  @HttpCode(HttpStatus.OK)
  payoutPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MarkPaidDto,
    @Req() req: Request,
  ) {
    return this.payouts.markPaid(
      actorFromUser(user, req),
      id,
      dto.bankReference,
    );
  }

  @Post('payouts/:id/mark-failed')
  @HttpCode(HttpStatus.OK)
  payoutFailed(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.payouts.markFailed(actorFromUser(user, req), id, dto.reason);
  }

  @Post('payouts/:id/reject')
  @HttpCode(HttpStatus.OK)
  payoutReject(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.payouts.reject(actorFromUser(user, req), id, dto.reason);
  }

  @Post('payouts/:id/cancel')
  @HttpCode(HttpStatus.OK)
  payoutCancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.payouts.cancel(actorFromUser(user, req), id, dto.reason);
  }

  @Post('payouts/run-automatic')
  @RequiresCapability('PAYOUTS_ENABLED')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run the automatic settlement now (same code as the scheduled job; idempotent per day)',
  })
  runAuto() {
    return this.payouts.runAutomatic();
  }

  @Post('jobs/release-due')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Release holding-period-complete sales now (same code as the scheduled job; idempotent)',
  })
  releaseDue() {
    return this.release.releaseDue();
  }

  // ---- refunds ----------------------------------------------------------------------
  @Post('refunds/:refundId/disbursement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record that the buyer was paid back (bank reference unique; once per refund)',
  })
  disburse(
    @CurrentUser() user: AuthUser,
    @Param('refundId', new ParseUUIDPipe()) refundId: string,
    @Body() dto: DisbursementDto,
    @Req() req: Request,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const r = await this.refunds.recordDisbursement(manager, {
        refundId,
        reference: dto.reference,
        actor: actorFromUser(user, req),
      });
      return {
        ledgerTransactionId: r.ledgerTransactionId,
        amountMinor: r.amountMinor.toString(),
      };
    });
  }

  // ---- reconciliation -------------------------------------------------------------------
  @Post('reconciliation/import')
  @HttpCode(HttpStatus.OK)
  reconImport(
    @CurrentUser() user: AuthUser,
    @Body() dto: ImportReconciliationDto,
    @Req() req: Request,
  ) {
    return this.recon.import(actorFromUser(user, req), dto);
  }

  @Post('reconciliation/batches/:id/run')
  @HttpCode(HttpStatus.OK)
  reconRun(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.recon.run(actorFromUser(user, req), id);
  }

  @Post('reconciliation/batches/:id/post-settlement')
  @HttpCode(HttpStatus.OK)
  reconSettle(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.recon.postSettlement(actorFromUser(user, req), id);
  }

  @Get('reconciliation/items')
  reconItems(
    @Query('classification') classification?: string,
    @Query('status') status?: string,
    @Query('page', PageParamPipe) page = 1,
    @Query('pageSize', new PageSizeParamPipe(50, 200)) pageSize = 50,
  ) {
    return this.recon.listItems({
      classification: classification as ReconClass | undefined,
      status,
      limit: Number(pageSize),
      offset: (Number(page) - 1) * Number(pageSize),
    });
  }

  @Post('reconciliation/items/:id/advance')
  @HttpCode(HttpStatus.OK)
  reconAdvance(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdvanceReconciliationDto,
    @Req() req: Request,
  ) {
    return this.recon.advance(actorFromUser(user, req), id, dto.to, dto.note);
  }

  // ---- receipts ---------------------------------------------------------------------------
  @Get('receipts/:id')
  receipt(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.receipts.getForAdmin(id);
  }

  @Get('clock')
  @ApiOperation({
    summary: 'The instant the finance rules currently consider "now"',
  })
  now() {
    return { now: this.clock.now().toISOString() };
  }
}
