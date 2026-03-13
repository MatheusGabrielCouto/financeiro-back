import { Controller, Get, NotFoundException, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";
import { roundMoney } from "src/utils/money";

@Controller("/amount")
export class Amount {
  constructor(private prisma: PrismaService) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload) {
    const userFiltered = await this.prisma.user.findUnique({
      where: { id: user.sub }
    });

    if (!userFiltered) {
      throw new NotFoundException("Usuário não encontrado!");
    }

    await this.processRecurringIncomes(user.sub);

    const updatedUser = await this.prisma.user.findUnique({
      where: { id: user.sub }
    });

    return {
      amount: roundMoney(updatedUser?.amount ?? userFiltered.amount ?? 0)
    };
  }

  private async processRecurringIncomes(userId: string) {
    const today = new Date();
    const lastDayOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0
    ).getDate();

    const recurringIncomes = await this.prisma.recurringIncome.findMany({
      where: { userId }
    });

    let totalToAdd = 0;
    const toProcess: { id: string; value: number; title: string }[] = [];

    for (const income of recurringIncomes) {
      const effectivePaymentDay = Math.min(income.dayOfMonth, lastDayOfMonth);
      const isPaymentDay = today.getDate() >= effectivePaymentDay;
      const alreadyProcessed =
        income.lastProcessedAt &&
        income.lastProcessedAt.getMonth() === today.getMonth() &&
        income.lastProcessedAt.getFullYear() === today.getFullYear();

      if (isPaymentDay && !alreadyProcessed) {
        totalToAdd += income.value;
        toProcess.push({ id: income.id, value: income.value, title: income.title });
      }
    }

    if (totalToAdd === 0) return;

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { amount: true }
      });
      if (!user) return;
      const newAmount = roundMoney(user.amount + totalToAdd);
      await tx.user.update({
        where: { id: userId },
        data: { amount: newAmount }
      });

      const salarioCategory = await tx.category.findFirst({
        where: { title: "Salário", userId: null }
      });
      const now = new Date();
      for (const { id, value, title } of toProcess) {
        const transaction = await tx.transaction.create({
          data: {
            value,
            message: `${title} (entrada recorrente)`,
            type: "CREDIT",
            isRecurring: true,
            userId
          }
        });
        if (salarioCategory) {
          await tx.transactionOnCategory.create({
            data: {
              transactionId: transaction.id,
              categoryId: salarioCategory.id
            }
          });
        }
        await tx.recurringIncome.update({
          where: { id },
          data: { lastProcessedAt: now }
        });
      }
    });
  }
} 