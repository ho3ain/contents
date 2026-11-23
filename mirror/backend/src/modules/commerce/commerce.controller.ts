import { isUUID } from 'class-validator';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../../database/entities/identity/user.entity';
import { CommerceService, CheckoutResult } from './commerce.service';
import { OrdersService, OrderView, OrderDetailView } from './orders.service';
import { MyOrdersQueryDto } from './dto/my-orders-query.dto';
import { PaymentsService, CallbackResult } from './payments.service';
import { EntitlementsService, EntitlementView } from './entitlements.service';
import { RefundsService } from './refunds.service';
import { AccessDecisionDto } from './dto/entitlement.dto';
import {
  CheckoutContext,
  GatewayEventDto,
  PaymentConfirmDto,
  RefundRequestDto,
  SandboxConfirmDto,
} from './dto/purchase.dto';
import { RequiresCapability } from '../control-plane/config/kill-switch.guard';

const PURCHASERS = [UserRole.BUYER, UserRole.CREATOR];

/** A5 §9 — the optional `promotionId` of a checkout body (UUID or null). */
function checkoutPromotionId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as CheckoutContext).promotionId;
  return typeof value === 'string' && isUUID(value) ? value : null;
}

/**
 * Sprint 2 (P2-01) — the optional reviewed amount. Only a plain decimal
 * string (≤ 32 chars) is accepted; anything else is ignored exactly like
 * every other unknown body field (the body is deliberately lenient).
 */
function checkoutExpectedAmount(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as CheckoutContext).expectedAmount;
  return typeof value === 'string' &&
    value.length <= 32 &&
    /^\d+(\.\d+)?$/.test(value)
    ? value
    : null;
}

@ApiTags('commerce')
@ApiBearerAuth()
@Controller()
export class CommerceController {
  constructor(
    private readonly commerceService: CommerceService,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly entitlementsService: EntitlementsService,
    private readonly refundsService: RefundsService,
  ) {}

  @Post('agents/:slug/checkout')
  @RequiresCapability('CHECKOUT_ENABLED', 'PAYMENTS_ENABLED')
  @Roles(...PURCHASERS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Start a paid purchase: order + initiated payment with listing snapshot',
  })
  @ApiConflictResponse({
    description:
      'ALREADY_PURCHASED — the buyer already owns the agent (or is its creator). ' +
      'PRICE_CHANGED — the optional `expectedAmount` no longer matches the listing price (details.currentAmount). ' +
      'PAYMENT_MODEL_NOT_SUPPORTED — the declared commercial payment model requires billing or metering that this one-time checkout cannot perform.',
  })
  @ApiNotFoundResponse({
    description: 'AGENT_NOT_FOUND — unknown or unpublished slug.',
  })
  checkout(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    // Deliberately NOT a whitelisted DTO: the checkout body has always been
    // ignored (price authority — injected amount/owner fields must not turn
    // into 400s). Only the optional A5 attribution id is read, and anything
    // that is not a UUID is dropped (the service validates it further).
    @Body() body: unknown,
  ): Promise<CheckoutResult> {
    return this.commerceService.checkout(
      user.id,
      slug,
      checkoutPromotionId(body),
      checkoutExpectedAmount(body),
    );
  }

  @Post('agents/:slug/acquire')
  @Roles(...PURCHASERS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Acquire a free agent (direct entitlement, no order)',
  })
  @ApiConflictResponse({
    description:
      'CONFLICT — the agent is not free, or the buyer already owns it / is its creator.',
  })
  @ApiNotFoundResponse({
    description: 'AGENT_NOT_FOUND — unknown or unpublished slug.',
  })
  acquireFree(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
  ): Promise<{ entitlementId: string }> {
    return this.commerceService.acquireFree(user.id, slug);
  }

  @Get('me/orders')
  @ApiOperation({
    summary:
      'My orders with historical snapshots (optional order-status group filter)',
  })
  async myOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: MyOrdersQueryDto,
  ): Promise<{ items: OrderView[]; meta: unknown }> {
    const result = await this.ordersService.listMine(
      user.id,
      query.page ?? 1,
      query.pageSize ?? 20,
      query.status,
    );
    return { items: result.items, meta: result.meta };
  }

  @Get('me/orders/:id')
  @ApiOperation({
    summary:
      'One of my orders with payment, access, refunds (+ eligibility), internal receipts and timeline',
  })
  myOrder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDetailView> {
    return this.ordersService.getMineDetail(user.id, id);
  }

  @Post('me/orders/:id/refunds')
  @Roles(...PURCHASERS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a manual refund for a paid order' })
  async requestRefund(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: RefundRequestDto,
  ): Promise<{ id: string; status: string }> {
    const refund = await this.refundsService.request(
      user.id,
      orderId,
      dto.reason,
    );
    return { id: refund.id, status: refund.status };
  }

  @Get('me/entitlements')
  @ApiOperation({ summary: 'My agents (entitlements)' })
  myEntitlements(@CurrentUser() user: AuthUser): Promise<EntitlementView[]> {
    return this.entitlementsService.listMine(user.id);
  }

  @Get('me/entitlements/:id')
  @ApiOperation({
    summary: 'My entitlement authority view and immutable terms status',
  })
  myEntitlement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EntitlementView> {
    return this.entitlementsService.getMine(user.id, id);
  }

  @Get('me/entitlements/:id/events')
  @ApiOperation({ summary: 'My entitlement lifecycle history' })
  myEntitlementEvents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.entitlementsService.listMineEvents(user.id, id);
  }

  @Post('me/entitlements/:id/access-decisions')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Authoritative access decision for one of my entitlement capabilities',
    description:
      'Evaluates lifecycle, expiry, scope and usage at request time. Responses may be cached only until the supplied policySequence changes or a short local TTL expires.',
  })
  decideMyEntitlementAccess(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccessDecisionDto,
  ) {
    return this.entitlementsService.decideMineById(user.id, id, dto.capability);
  }

  @Public()
  @Post('payments/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Payment gateway webhook (HMAC-verified, idempotent)',
  })
  async webhook(@Body() dto: GatewayEventDto): Promise<{ status: string }> {
    return this.paymentsService.handleWebhookEvent({
      gateway: dto.gateway,
      event: dto.event,
      transactionId: dto.transactionId,
      amount: dto.amount,
      currency: dto.currency,
      signature: dto.signature,
    });
  }

  @Post('payments/confirm')
  @Roles(...PURCHASERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Buyer returned from the gateway: verify server-to-server and finalize (idempotent)',
    description:
      'The backend re-verifies the payment with the provider using the PERSISTED amount — a redirect back is never treated as success by itself. Repeated calls (refresh, back button) are idempotent.',
  })
  @ApiNotFoundResponse({
    description: 'NOT_FOUND — unknown payment transaction.',
  })
  @ApiForbiddenResponse({
    description: 'FORBIDDEN — the payment belongs to another buyer.',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR — malformed body (forbidNonWhitelisted).',
  })
  async confirmPayment(
    @CurrentUser() user: AuthUser,
    @Body() dto: PaymentConfirmDto,
  ): Promise<CallbackResult> {
    return this.paymentsService.verifyCallback(
      user.id,
      dto.transactionId,
      dto.status,
    );
  }

  @Post('payments/sandbox/confirm')
  @Roles(...PURCHASERS)
  @ApiOperation({
    summary:
      'Development sandbox: confirm a pending sandbox payment server-side',
  })
  async sandboxConfirm(
    @CurrentUser() user: AuthUser,
    @Body() dto: SandboxConfirmDto,
  ): Promise<{ status: string }> {
    return this.commerceService.sandboxConfirm(user.id, dto.transactionId);
  }

  @Post('payments/sandbox/fail')
  @Roles(...PURCHASERS)
  @ApiOperation({
    summary:
      'Development sandbox: simulate a gateway failure through the REAL signed-webhook path',
  })
  async sandboxFail(
    @CurrentUser() user: AuthUser,
    @Body() dto: SandboxConfirmDto,
  ): Promise<{ status: string }> {
    return this.paymentsService.sandboxFailPayment(user.id, dto.transactionId);
  }
}
