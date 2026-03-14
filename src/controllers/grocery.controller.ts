import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { CurrentUser } from 'src/auth/current-user-decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserPayload } from 'src/auth/jwt.strategy';
import { PrismaService } from 'src/prisma/prisma.service';
import { GroceryService } from 'src/services/grocery.service';
import { roundMoney } from 'src/utils/money';
import { ZodValidationPipe } from 'src/pipes/zod-validation-pipe';
import { z } from 'zod';

const DAYS_FOR_ESTIMATE = 30;

const nextPurchaseListItemSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  quantity: z.coerce.number().int().positive(),
});

const nextPurchaseListBodySchema = z.object({
  title: z.string().min(1).optional().default('Próxima compra'),
  items: z.array(nextPurchaseListItemSchema).min(1, 'Pelo menos um item é obrigatório'),
});

type NextPurchaseListBody = z.infer<typeof nextPurchaseListBodySchema>;
const nextPurchaseListPipe = new ZodValidationPipe(nextPurchaseListBodySchema);

@Controller('/grocery')
export class GroceryController {
  constructor(
    private prisma: PrismaService,
    private groceryService: GroceryService,
  ) {}

  @Post('next-purchase-list')
  @UseGuards(JwtAuthGuard)
  async createNextPurchaseList(
    @CurrentUser() user: UserPayload,
    @Body(nextPurchaseListPipe) body: NextPurchaseListBody,
  ) {
    const pantryItems = await this.prisma.pantryItem.findMany({
      where: {
        userId: user.sub,
        consumptionPerDay: { not: null, gt: 0 },
      },
    });

    const groceryList = await this.prisma.groceryList.create({
      data: {
        title: body.title,
        userId: user.sub,
      },
    });

    const userListItemsLower = new Map<string, { name: string; quantity: number }>();
    for (const item of body.items) {
      await this.prisma.groceryListItem.create({
        data: {
          listId: groceryList.id,
          name: item.name,
          quantity: item.quantity,
        },
      });
      userListItemsLower.set(item.name.toLowerCase(), {
        name: item.name,
        quantity: item.quantity,
      });
    }

    const estimateStatus: {
      name: string;
      quantityNeeded: number;
      averagePrice: number;
      estimatedCost: number;
      status: 'ADDED' | 'PENDING';
      addedQuantity?: number;
    }[] = [];

    for (const pantryItem of pantryItems) {
      const avgPrice = await this.groceryService.getAveragePrice(
        this.prisma,
        user.sub,
        pantryItem.name,
      );
      if (!avgPrice) continue;

      const quantityNeeded = Math.ceil(
        (pantryItem.consumptionPerDay ?? 0) * DAYS_FOR_ESTIMATE,
      );
      const estimatedCost = roundMoney(quantityNeeded * avgPrice);

      const listItem = userListItemsLower.get(pantryItem.name.toLowerCase());

      if (listItem) {
        estimateStatus.push({
          name: pantryItem.name,
          quantityNeeded,
          averagePrice: avgPrice,
          estimatedCost,
          status: 'ADDED',
          addedQuantity: listItem.quantity,
        });
      } else {
        estimateStatus.push({
          name: pantryItem.name,
          quantityNeeded,
          averagePrice: avgPrice,
          estimatedCost,
          status: 'PENDING',
        });
      }
    }

    const listWithItems = await this.prisma.groceryList.findUnique({
      where: { id: groceryList.id },
      include: { items: true },
    });

    return {
      groceryList: listWithItems,
      estimateStatus,
    };
  }

  @Get('next-purchase-estimate')
  @UseGuards(JwtAuthGuard)
  async nextPurchaseEstimate(@CurrentUser() user: UserPayload) {
    const pantryItems = await this.prisma.pantryItem.findMany({
      where: {
        userId: user.sub,
        consumptionPerDay: { not: null, gt: 0 },
      },
    });

    const items: {
      name: string;
      quantityNeeded: number;
      averagePrice: number;
      estimatedCost: number;
    }[] = [];

    for (const item of pantryItems) {
      const avgPrice = await this.groceryService.getAveragePrice(
        this.prisma,
        user.sub,
        item.name,
      );
      if (!avgPrice) continue;

      const quantityNeeded = Math.ceil(
        (item.consumptionPerDay ?? 0) * DAYS_FOR_ESTIMATE,
      );
      const estimatedCost = roundMoney(quantityNeeded * avgPrice);

      items.push({
        name: item.name,
        quantityNeeded,
        averagePrice: avgPrice,
        estimatedCost,
      });
    }

    const totalEstimatedCost = roundMoney(
      items.reduce((sum, i) => sum + i.estimatedCost, 0),
    );

    return { items, totalEstimatedCost };
  }

  @Get('price-history')
  @UseGuards(JwtAuthGuard)
  async priceHistory(
    @CurrentUser() user: UserPayload,
    @Query('item') itemName: string,
  ) {
    if (!itemName?.trim()) {
      throw new NotFoundException('Parâmetro item é obrigatório');
    }

    const purchaseItems = await this.prisma.groceryPurchaseItem.findMany({
      where: {
        name: { equals: itemName.trim(), mode: 'insensitive' },
        purchase: { userId: user.sub },
      },
      include: { purchase: { select: { date: true } } },
      orderBy: { purchase: { date: 'asc' } },
    });

    if (purchaseItems.length === 0) {
      throw new NotFoundException('Item não encontrado no histórico');
    }

    const history = purchaseItems.map((i) => ({
      date: i.purchase.date.toISOString().split('T')[0],
      price: i.price,
    }));

    const totalCost = purchaseItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const totalQty = purchaseItems.reduce((sum, i) => sum + i.quantity, 0);
    const averagePrice =
      totalQty > 0 ? roundMoney(totalCost / totalQty) : 0;

    const firstPrice = purchaseItems[0].price;
    const lastPrice = purchaseItems[purchaseItems.length - 1].price;
    const priceChangePercent =
      firstPrice > 0
        ? roundMoney(((lastPrice - firstPrice) / firstPrice) * 100)
        : 0;

    return {
      name: purchaseItems[0].name,
      history,
      averagePrice,
      priceChangePercent,
    };
  }

  @Get('price-insights')
  @UseGuards(JwtAuthGuard)
  async priceInsights(@CurrentUser() user: UserPayload) {
    const purchaseItems = await this.prisma.groceryPurchaseItem.findMany({
      where: { purchase: { userId: user.sub } },
      include: { purchase: { select: { date: true } } },
      orderBy: { purchase: { date: 'asc' } },
    });

    const byName = new Map<
      string,
      { prices: number[]; quantities: number[]; dates: Date[]; displayName: string }
    >();

    for (const item of purchaseItems) {
      const key = item.name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, {
          prices: [],
          quantities: [],
          dates: [],
          displayName: item.name,
        });
      }
      const entry = byName.get(key)!;
      entry.prices.push(item.price);
      entry.quantities.push(item.quantity);
      entry.dates.push(item.purchase.date);
      entry.displayName = item.name;
    }

    const items: {
      name: string;
      averagePrice: number;
      lastPrice: number;
      priceChangePercent: number;
      trend: 'UP' | 'DOWN' | 'STABLE';
    }[] = [];

    for (const [, data] of byName) {
      const totalCost = data.prices.reduce(
        (sum, p, i) => sum + p * data.quantities[i],
        0,
      );
      const totalQty = data.quantities.reduce((a, b) => a + b, 0);
      const averagePrice = totalQty > 0 ? roundMoney(totalCost / totalQty) : 0;
      const lastPrice = data.prices[data.prices.length - 1] ?? 0;
      const firstPrice = data.prices[0] ?? 0;
      const priceChangePercent =
        firstPrice > 0
          ? roundMoney(((lastPrice - firstPrice) / firstPrice) * 100)
          : 0;

      let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
      if (priceChangePercent > 1) trend = 'UP';
      else if (priceChangePercent < -1) trend = 'DOWN';

      items.push({
        name: data.displayName,
        averagePrice,
        lastPrice,
        priceChangePercent,
        trend,
      });
    }

    return { items };
  }
}
