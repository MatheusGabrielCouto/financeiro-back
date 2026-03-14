import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { CurrentUser } from 'src/auth/current-user-decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserPayload } from 'src/auth/jwt.strategy';
import { PrismaService } from 'src/prisma/prisma.service';
import { ZodValidationPipe } from 'src/pipes/zod-validation-pipe';
import { z } from 'zod';

const quantityBodySchema = z.object({
  quantity: z.coerce.number().int().positive(),
});

type QuantityBody = z.infer<typeof quantityBodySchema>;

const quantityPipe = new ZodValidationPipe(quantityBodySchema);

const LOW_QUANTITY_THRESHOLD = 2;
const DAYS_REMAINING_ALERT = 3;

@Controller('/pantry')
export class PantryController {
  constructor(private prisma: PrismaService) {}

  @Get('insights')
  @UseGuards(JwtAuthGuard)
  async insights(@CurrentUser() user: UserPayload) {
    const items = await this.prisma.pantryItem.findMany({
      where: { userId: user.sub },
      orderBy: { name: 'asc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      items: items.map((item) => {
        let estimatedFinishDate: string | null = null;
        let daysRemaining: number | null = null;

        if (item.consumptionPerDay && item.consumptionPerDay > 0) {
          const daysUntilFinish = item.quantity / item.consumptionPerDay;
          const finishDate = new Date(today);
          finishDate.setDate(finishDate.getDate() + Math.ceil(daysUntilFinish));
          estimatedFinishDate = finishDate.toISOString().split('T')[0];
          daysRemaining = Math.max(0, Math.floor(daysUntilFinish));
        }

        return {
          name: item.name,
          quantity: item.quantity,
          consumptionPerDay: item.consumptionPerDay,
          estimatedFinishDate,
          daysRemaining,
        };
      }),
    };
  }

  @Get('alerts')
  @UseGuards(JwtAuthGuard)
  async alerts(@CurrentUser() user: UserPayload) {
    const items = await this.prisma.pantryItem.findMany({
      where: { userId: user.sub },
      orderBy: { name: 'asc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alerts = items
      .filter((item) => {
        if (!item.consumptionPerDay || item.consumptionPerDay <= 0) return false;
        const daysRemaining = Math.floor(item.quantity / item.consumptionPerDay);
        return daysRemaining <= DAYS_REMAINING_ALERT;
      })
      .map((item) => {
        const daysRemaining = Math.floor(
          item.quantity / (item.consumptionPerDay ?? 1),
        );
        return {
          name: item.name,
          quantity: item.quantity,
          daysRemaining,
          message: `⚠️ ${item.name} está acabando`,
        };
      });

    return { alerts };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload) {
    const items = await this.prisma.pantryItem.findMany({
      where: { userId: user.sub },
      orderBy: { name: 'asc' },
    });
    return items.map((item) => ({
      ...item,
      lowQuantityAlert:
        item.quantity <= LOW_QUANTITY_THRESHOLD
          ? `Item "${item.name}" está acabando (quantidade: ${item.quantity})`
          : null,
    }));
  }

  @Patch(':id/add')
  @UseGuards(JwtAuthGuard)
  async add(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body(quantityPipe) body: QuantityBody,
  ) {
    const item = await this.prisma.pantryItem.findFirst({
      where: { id, userId: user.sub },
    });
    if (!item) throw new NotFoundException('Item não encontrado');
    return this.prisma.pantryItem.update({
      where: { id },
      data: { quantity: { increment: body.quantity } },
    });
  }

  @Patch(':id/use')
  @UseGuards(JwtAuthGuard)
  async use(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body(quantityPipe) body: QuantityBody,
  ) {
    const item = await this.prisma.pantryItem.findFirst({
      where: { id, userId: user.sub },
    });
    if (!item) throw new NotFoundException('Item não encontrado');
    if (item.quantity < body.quantity) {
      throw new BadRequestException(
        `Quantidade insuficiente. Disponível: ${item.quantity}`,
      );
    }
    const updated = await this.prisma.pantryItem.update({
      where: { id },
      data: { quantity: { decrement: body.quantity } },
    });
    const lowQuantityAlert =
      updated.quantity <= LOW_QUANTITY_THRESHOLD
        ? `Item "${updated.name}" está acabando (quantidade: ${updated.quantity})`
        : null;
    return { ...updated, lowQuantityAlert };
  }
}
