import { PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { roundMoney } from 'src/utils/money';

type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class GroceryService {
  constructor(private prisma: PrismaService) {}

  async calculateConsumptionMetrics(
    tx: PrismaTx | PrismaService,
    userId: string,
    itemName: string,
  ): Promise<{
    consumptionPerDay: number | null;
    averageDurationDays: number | null;
  }> {
    const purchaseItems = await tx.groceryPurchaseItem.findMany({
      where: {
        name: { equals: itemName, mode: 'insensitive' },
        purchase: { userId },
      },
      include: { purchase: { select: { date: true } } },
      orderBy: { purchase: { date: 'asc' } },
    });

    if (purchaseItems.length < 2) {
      return { consumptionPerDay: null, averageDurationDays: null };
    }

    const durations: number[] = [];
    const consumptionsPerDay: number[] = [];

    for (let i = 0; i < purchaseItems.length - 1; i++) {
      const current = purchaseItems[i];
      const next = purchaseItems[i + 1];
      const currentDate = new Date(current.purchase.date);
      const nextDate = new Date(next.purchase.date);
      const daysDiff = Math.max(
        1,
        Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const quantityConsumed = current.quantity;
      durations.push(daysDiff);
      consumptionsPerDay.push(quantityConsumed / daysDiff);
    }

    const avgDuration = Math.round(
      durations.reduce((a, b) => a + b, 0) / durations.length,
    );
    const avgConsumption = roundMoney(
      consumptionsPerDay.reduce((a, b) => a + b, 0) / consumptionsPerDay.length,
    );

    return {
      consumptionPerDay: avgConsumption,
      averageDurationDays: avgDuration,
    };
  }

  async getAveragePrice(
    tx: PrismaTx | PrismaService,
    userId: string,
    itemName: string,
  ): Promise<number | null> {
    const items = await tx.groceryPurchaseItem.findMany({
      where: {
        name: { equals: itemName, mode: 'insensitive' },
        purchase: { userId },
      },
      select: { price: true, quantity: true },
    });

    if (items.length === 0) return null;

    const totalCost = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
    return totalQty > 0 ? roundMoney(totalCost / totalQty) : null;
  }
}
