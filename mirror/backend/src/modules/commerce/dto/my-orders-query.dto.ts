import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ORDER_STATUS_GROUPS, type OrderStatusGroup } from '../order-detail';

/** `GET /me/orders` — pagination plus an optional ORDER-status group filter. */
export class MyOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ORDER_STATUS_GROUPS,
    description:
      'Order-status group: pending (created, pending_payment) · paid (paid, fulfilled) · failed (failed, cancelled) · refunded',
  })
  @IsOptional()
  @IsIn(ORDER_STATUS_GROUPS, {
    message: `status must be one of ${ORDER_STATUS_GROUPS.join(', ')}`,
  })
  status?: OrderStatusGroup;
}
