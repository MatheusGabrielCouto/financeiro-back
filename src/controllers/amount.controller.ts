import { Controller, Get, NotFoundException, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";

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
      amount: updatedUser?.amount ?? userFiltered.amount
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
      await tx.user.update({
        where: { id: userId },
        data: { amount: { increment: totalToAdd } }
      });

      const now = new Date();
      for (const { id, value, title } of toProcess) {
        await tx.transaction.create({
          data: {
            value,
            message: `${title} (entrada recorrente)`,
            type: "CREDIT",
            isRecurring: true,
            userId
          }
        });
        await tx.recurringIncome.update({
          where: { id },
          data: { lastProcessedAt: now }
        });
      }
    });
  }
} 