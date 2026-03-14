import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from './notification.service';
import { roundMoney } from 'src/utils/money';

@Injectable()
export class RecurringIncomeNotificationService {
  constructor(
    private prisma: PrismaService,
    private notification: NotificationService,
  ) {}

  async processAndNotify(): Promise<void> {
    const today = new Date();
    const lastDayOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    ).getDate();

    const recurringIncomes = await this.prisma.recurringIncome.findMany();

    const byUser = new Map<
      string,
      { id: string; value: number; title: string }[]
    >();

    for (const income of recurringIncomes) {
      const effectivePaymentDay = Math.min(income.dayOfMonth, lastDayOfMonth);
      const isPaymentDay = today.getDate() >= effectivePaymentDay;
      const alreadyProcessed =
        income.lastProcessedAt &&
        income.lastProcessedAt.getMonth() === today.getMonth() &&
        income.lastProcessedAt.getFullYear() === today.getFullYear();

      if (isPaymentDay && !alreadyProcessed) {
        const list = byUser.get(income.userId) ?? [];
        list.push({ id: income.id, value: income.value, title: income.title });
        byUser.set(income.userId, list);
      }
    }

    for (const [userId, toProcess] of byUser) {
      if (toProcess.length === 0) continue;

      const totalToAdd = toProcess.reduce((s, i) => s + i.value, 0);

      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { amount: true },
        });
        if (!user) return;

        const newAmount = roundMoney(user.amount + totalToAdd);
        await tx.user.update({
          where: { id: userId },
          data: { amount: newAmount },
        });

        const salarioCategory = await tx.category.findFirst({
          where: { title: 'Salário', userId: null },
        });
        const now = new Date();

        for (const { id, value, title } of toProcess) {
          const transaction = await tx.transaction.create({
            data: {
              value,
              message: `${title} (entrada recorrente)`,
              type: 'CREDIT',
              isRecurring: true,
              userId,
            },
          });
          if (salarioCategory) {
            await tx.transactionOnCategory.create({
              data: {
                transactionId: transaction.id,
                categoryId: salarioCategory.id,
              },
            });
          }
          await tx.recurringIncome.update({
            where: { id },
            data: { lastProcessedAt: now },
          });
        }
      });

      const tokens = await this.prisma.pushToken.findMany({
        where: { userId },
        select: { token: true },
      });
      if (tokens.length === 0) continue;

      const itemsText = toProcess
        .map((i) => `${i.title}: R$ ${i.value.toFixed(2)}`)
        .join('. ');
      const title = 'Entradas recorrentes creditadas';
      const body =
        toProcess.length === 1
          ? `${itemsText} foi adicionado ao seu saldo.`
          : `${itemsText} Total: R$ ${totalToAdd.toFixed(2)} adicionado ao seu saldo.`;

      await this.notification.sendToMany(
        tokens.map((t) => t.token),
        title,
        body,
        {
          type: 'recurring_income_credited',
          screen: 'Amount',
          params: {},
        },
      );
    }
  }
}
