import {
  PageParamPipe,
  PageSizeParamPipe,
} from '../../common/validation/page-params.pipe';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../../database/entities/identity/user.entity';
import { Order } from '../../database/entities/commerce/order.entity';
import { Payment } from '../../database/entities/commerce/payment.entity';
import { Refund } from '../../database/entities/commerce/refund.entity';
import { RefundsService } from './refunds.service';
import { EntitlementsService } from './entitlements.service';
import {
  ENTITLEMENT_LIFECYCLE_STATES,
  type EntitlementLifecycleState,
} from '../../database/entities/commerce/entitlement.entity';
import { ApiException } from '../../common/errors/api-error';
import { AdminRefundDecisionDto } from './dto/purchase.dto';

@ApiTags('admin-commerce')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminCommerceController {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(Refund)
    private readonly refundsRepository: Repository<Refund>,
    private readonly refundsService: RefundsService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  @Get('entitlements')
  @ApiOperation({ summary: 'Entitlement authority rows (admin)' })
  async entitlements(
    @Query('state') state: string | undefined,
    @Query('page', PageParamPipe) page = 1,
    @Query('pageSize', new PageSizeParamPipe(20, 100)) pageSize = 20,
  ) {
    if (
      state &&
      !(ENTITLEMENT_LIFECYCLE_STATES as readonly string[]).includes(state)
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Unknown entitlement lifecycle state',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.entitlementsService.listAdmin(
      state as EntitlementLifecycleState | undefined,
      Number(page),
      Math.min(Number(pageSize), 100),
    );
  }

  @Get('entitlements/:id/events')
  @ApiOperation({ summary: 'Entitlement lifecycle history (admin)' })
  entitlementEvents(@Param('id', ParseUUIDPipe) id: string) {
    return this.entitlementsService.listAdminEvents(id);
  }

  @Post('entitlements/:id/suspend')
  @ApiOperation({ summary: 'Suspend an active entitlement (admin)' })
  suspendEntitlement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.entitlementsService.suspendByAdmin(id, user.id);
  }

  @Post('entitlements/:id/restore')
  @ApiOperation({
    summary:
      'Restore a suspended entitlement when its term is still live (admin)',
  })
  restoreEntitlement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.entitlementsService.restoreByAdmin(id, user.id);
  }

  @Get('orders')
  @ApiOperation({ summary: 'All orders (admin)' })
  async orders(
    @Query('status') status?: string,
    @Query('page', PageParamPipe) page = 1,
    @Query('pageSize', new PageSizeParamPipe(20, 100)) pageSize = 20,
  ) {
    // Individual param binding: a whole-object PaginationQueryDto binding
    // would 400 any ?status= filter under forbidNonWhitelisted.
    const [orders, total] = await this.ordersRepository.findAndCount({
      where: status ? { status: status as Order['status'] } : {},
      relations: { buyer: true },
      order: { createdAt: 'DESC' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Math.min(Number(pageSize), 100),
    });
    return {
      items: orders.map((order) => ({
        id: order.id,
        buyer: order.buyer
          ? {
              id: order.buyer.id,
              email: order.buyer.email,
              username: order.buyer.username,
            }
          : null,
        status: order.status,
        amount: order.amount,
        currencyCode: order.currency,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
      })),
      total,
    };
  }

  @Get('payments')
  @ApiOperation({ summary: 'All payments (admin)' })
  async payments(
    @Query('status') status?: string,
    @Query('page', PageParamPipe) page = 1,
    @Query('pageSize', new PageSizeParamPipe(20, 100)) pageSize = 20,
  ) {
    const [payments, total] = await this.paymentsRepository.findAndCount({
      where: status ? { status: status as Payment['status'] } : {},
      relations: { order: true },
      order: { createdAt: 'DESC' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Math.min(Number(pageSize), 100),
    });
    return {
      items: payments.map((payment) => ({
        id: payment.id,
        orderId: payment.orderId,
        gateway: payment.gateway,
        gatewayTransactionId: payment.gatewayTransactionId,
        amount: payment.amount,
        currencyCode: payment.currency,
        status: payment.status,
        confirmedAt: payment.confirmedAt,
        createdAt: payment.createdAt,
      })),
      total,
    };
  }

  @Get('refunds')
  @ApiOperation({ summary: 'Refund requests (admin)' })
  async refunds(
    @Query('status') status?: string,
    @Query('page', PageParamPipe) page = 1,
    @Query('pageSize', new PageSizeParamPipe(20, 100)) pageSize = 20,
  ) {
    const { refunds, total } = await this.refundsService.list(
      status &&
        (status === 'requested' ||
          status === 'under_review' ||
          status === 'processed' ||
          status === 'rejected')
        ? (status as Refund['status'])
        : undefined,
      Number(page),
      Math.min(Number(pageSize), 100),
    );
    // { items, total } — the shape every other admin list endpoint (and the
    // admin UI) expects; the raw service key previously left the refunds
    // tab permanently empty.
    return { items: refunds, total };
  }

  @Post('refunds/:id/review')
  @ApiOperation({
    summary: 'Open a refund request for review (buyer sees «under review»)',
  })
  async startRefundReview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ id: string; status: string }> {
    const refund = await this.refundsService.startReview(user.id, id);
    return { id: refund.id, status: refund.status };
  }

  @Post('refunds/:id/decision')
  @ApiOperation({ summary: 'Approve or reject a refund request (admin)' })
  async decideRefund(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminRefundDecisionDto,
  ): Promise<{ id: string; status: string }> {
    const refund = await this.refundsService.decide(
      user.id,
      id,
      dto.decision,
      dto.note ?? '',
      dto.amount,
    );
    return { id: refund.id, status: refund.status };
  }
}
