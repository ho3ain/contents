import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/commerce/order.entity';
import { OrderItem } from '../../database/entities/commerce/order-item.entity';
import { Payment } from '../../database/entities/commerce/payment.entity';
import { Entitlement } from '../../database/entities/commerce/entitlement.entity';
import { EntitlementEvent } from '../../database/entities/commerce/entitlement-event.entity';
import { Refund } from '../../database/entities/commerce/refund.entity';
import { Agent } from '../../database/entities/agents/agent.entity';
import { AgentVersion } from '../../database/entities/agents/agent-version.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { CommerceController } from './commerce.controller';
import { AdminCommerceController } from './admin-commerce.controller';
import { CommerceService } from './commerce.service';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { EntitlementsService } from './entitlements.service';
import { RefundsService } from './refunds.service';
import { WebhookSignatureService } from './webhook-signature.service';
import { createPaymentGateway } from './gateway/payment-gateway.factory';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.types';
import { EmailModule } from '../email/email.module';
import { CrmModule } from '../crm/crm.module';
// Phase C5 — the growth loop runs at payment confirmation, so a paid order
// can actually create attribution, a referral reward and an affiliate
// commission. ScaleModule does not import CommerceModule, so this is a plain
// one-way dependency and needs no forwardRef.
import { ScaleModule } from '../scale/scale.module';

@Module({
  imports: [
    EmailModule,
    // Phase C1 — creator lifecycle events for the CRM timeline/funnel.
    CrmModule,
    ScaleModule,
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Payment,
      Entitlement,
      EntitlementEvent,
      Refund,
      Agent,
      AgentVersion,
      CreatorProfile,
    ]),
  ],
  controllers: [CommerceController, AdminCommerceController],
  providers: [
    CommerceService,
    OrdersService,
    PaymentsService,
    EntitlementsService,
    RefundsService,
    WebhookSignatureService,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: createPaymentGateway,
    },
  ],
  exports: [
    OrdersService,
    PaymentsService,
    EntitlementsService,
    RefundsService,
    PAYMENT_GATEWAY,
  ],
})
export class CommerceModule {}
