import { Global, Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { BalanceService } from './balance.service';
import { BankAccountsService } from './bank-accounts.service';
import { CreatorResolver } from './creator-resolver';
import { FinanceAdminService } from './finance-admin.service';
import { FinanceClock } from './finance-clock';
import { FinanceExceptionsService } from './finance-exceptions.service';
import { FinanceJobsService } from './finance-jobs.service';
import { FinancialAuditService } from './financial-audit.service';
import { FinancialCalculationsService } from './financial-calculations.service';
import { FinancialHoldsService } from './financial-holds.service';
import {
  AdminFinanceController,
  CreatorFinanceController,
  ReceiptsController,
} from './finance.controllers';
import { IntegrityService } from './integrity.service';
import { KycService } from './kyc.service';
import { LedgerService } from './ledger.service';
import { PAYOUT_PROVIDER, ManualBankTransferProvider } from './payout-provider';
import { PayoutsService } from './payouts.service';
import { PolicyService } from './policy.service';
import { ReceiptsService } from './receipts.service';
import { ReconciliationService } from './reconciliation.service';
import { RecoveryService } from './recovery.service';
import { RefundSettlementService } from './refund-settlement.service';
import { ReleaseService } from './release.service';
import { SaleRecorderService } from './sale-recorder.service';
import { StatementsService } from './statements.service';
import { UsageMeteringService } from './usage-metering.service';

/**
 * Phase 2 — the financial core: policy, immutable ledger, balances,
 * refunds, payouts, KYC, reconciliation, statements and receipts.
 *
 * Global so Commerce (sale recording, refund settlement) and the buyer
 * journey (refund window) can depend on it without an import cycle:
 * FinanceModule imports nothing from Commerce.
 */
@Global()
@Module({
  imports: [CryptoModule],
  controllers: [
    CreatorFinanceController,
    ReceiptsController,
    AdminFinanceController,
  ],
  providers: [
    FinanceClock,
    FinancialAuditService,
    FinancialCalculationsService,
    FinanceExceptionsService,
    PolicyService,
    BalanceService,
    LedgerService,
    CreatorResolver,
    ReceiptsService,
    SaleRecorderService,
    RecoveryService,
    ReleaseService,
    RefundSettlementService,
    KycService,
    BankAccountsService,
    FinancialHoldsService,
    PayoutsService,
    ReconciliationService,
    StatementsService,
    UsageMeteringService,
    IntegrityService,
    FinanceAdminService,
    FinanceJobsService,
    { provide: PAYOUT_PROVIDER, useClass: ManualBankTransferProvider },
  ],
  exports: [
    FinanceClock,
    PolicyService,
    LedgerService,
    BalanceService,
    SaleRecorderService,
    RefundSettlementService,
    ReleaseService,
    PayoutsService,
    IntegrityService,
    FinancialAuditService,
    FinancialCalculationsService,
    ReceiptsService,
    FinanceExceptionsService,
    KycService,
    FinancialHoldsService,
    CreatorResolver,
    StatementsService,
    UsageMeteringService,
  ],
})
export class FinanceModule {}
