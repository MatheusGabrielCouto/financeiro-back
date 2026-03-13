import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";

const MONTHS_HISTORY = 12;
const DEFAULT_MONTHS_TARGET = 6;

@Controller("/emergency-reserve")
export class EmergencyReserveController {
  constructor(private prisma: PrismaService) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async getReserve(
    @CurrentUser() user: UserPayload,
    @Query("months") monthsParam?: string
  ) {
    const monthsTarget = monthsParam
      ? Math.min(12, Math.max(3, parseInt(monthsParam, 10)))
      : DEFAULT_MONTHS_TARGET;

    const now = new Date();
    const startOfHistory = new Date(
      now.getFullYear(),
      now.getMonth() - MONTHS_HISTORY,
      1
    );
    const endOfNext12Months = new Date(
      now.getFullYear(),
      now.getMonth() + 12,
      0,
      23,
      59,
      59
    );

    const [userData, recurringIncomes, recurringPayments, installmentsData, transactions] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: user.sub },
          select: { amount: true }
        }),
        this.prisma.recurringIncome.findMany({
          where: { userId: user.sub }
        }),
        this.prisma.recurringPayment.findMany({
          where: { userId: user.sub }
        }),
        this.prisma.installment.findMany({
          where: {
            debt: { userId: user.sub },
            status: "SCHEDULE",
            dateTransaction: { gte: now, lte: endOfNext12Months }
          },
          select: { value: true, dateTransaction: true }
        }),
        this.prisma.transaction.findMany({
          where: {
            userId: user.sub,
            type: { in: ["PAY", "DEBIT"] },
            createdAt: { gte: startOfHistory },
            NOT: {
              OR: [
                { message: { startsWith: "Depósito na caixinha" } },
                { message: { startsWith: "Retirada da caixinha" } },
                { message: { contains: "(pagamento recorrente)" } }
              ]
            }
          },
          select: { value: true, createdAt: true }
        })
      ]);

    const monthlyIncome = recurringIncomes.reduce((s, r) => s + r.value, 0);
    const monthlyRecurringPayments = recurringPayments.reduce(
      (s, r) => s + r.value,
      0
    );
    const monthsWithExpenses = new Set(
      transactions.map(
        (t) => `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`
      )
    ).size;
    const totalExpenses = transactions.reduce((s, t) => s + t.value, 0);
    const monthlyVariableExpenses =
      monthsWithExpenses > 0 ? totalExpenses / monthsWithExpenses : 0;

    const debtByMonth = new Map<string, number>();
    for (const inst of installmentsData) {
      const key = `${inst.dateTransaction.getFullYear()}-${inst.dateTransaction.getMonth()}`;
      debtByMonth.set(key, (debtByMonth.get(key) ?? 0) + inst.value);
    }
    const totalDebtNext12Months = [...debtByMonth.values()].reduce(
      (a, b) => a + b,
      0
    );
    const avgMonthlyDebts = totalDebtNext12Months / 12;

    const monthlyNeed =
      monthlyVariableExpenses + monthlyRecurringPayments + avgMonthlyDebts;

    const fallbackMonthlyNeed =
      monthlyNeed > 0 ? monthlyNeed : monthlyIncome * 0.7;
    const recommendedReserve =
      fallbackMonthlyNeed > 0 ? fallbackMonthlyNeed * monthsTarget : 0;
    const currentReserve = userData?.amount ?? 0;
    const monthsCovered =
      fallbackMonthlyNeed > 0 ? currentReserve / fallbackMonthlyNeed : 0;
    const progressPercent =
      recommendedReserve > 0
        ? Math.min(100, (currentReserve / recommendedReserve) * 100)
        : 0;

    const message =
      recommendedReserve > 0
        ? `Você deveria ter R$ ${recommendedReserve.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })} de reserva. Baseado em gastos mensais de R$ ${fallbackMonthlyNeed.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}.`
        : "Cadastre suas entradas recorrentes ou transações para calcular a reserva recomendada.";

    return {
      recommendedReserve: Math.round(recommendedReserve * 100) / 100,
      currentReserve: Math.round(currentReserve * 100) / 100,
      monthlyExpenses: Math.round(fallbackMonthlyNeed * 100) / 100,
      monthsTarget,
      monthsCovered: Math.round(monthsCovered * 10) / 10,
      progressPercent: Math.round(progressPercent * 100) / 100,
      message,
      missing: Math.round(Math.max(0, recommendedReserve - currentReserve) * 100) / 100
    };
  }
}
