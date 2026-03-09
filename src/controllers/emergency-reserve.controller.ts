import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";

const MONTHS_HISTORY = 6;
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

    const [caixinhaTotal, recurringIncomes, transactions] = await Promise.all([
      this.prisma.futurePurchase.aggregate({
        where: { userId: user.sub },
        _sum: { valueAdded: true }
      }),
      this.prisma.recurringIncome.findMany({
        where: { userId: user.sub }
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: user.sub,
          type: { in: ["PAY", "DEBIT"] },
          createdAt: { gte: startOfHistory },
          NOT: {
            OR: [
              { message: { startsWith: "Depósito na caixinha" } },
              { message: { startsWith: "Retirada da caixinha" } }
            ]
          }
        },
        select: { value: true, createdAt: true }
      })
    ]);

    const monthlyIncome = recurringIncomes.reduce((s, r) => s + r.value, 0);
    const monthsWithExpenses = new Set(
      transactions.map(
        (t) => `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`
      )
    ).size;
    const totalExpenses = transactions.reduce((s, t) => s + t.value, 0);
    const monthlyExpenses =
      monthsWithExpenses > 0 ? totalExpenses / monthsWithExpenses : 0;

    const monthlyNeed =
      monthlyExpenses > 0 ? monthlyExpenses : monthlyIncome * 0.7;
    const recommendedReserve =
      monthlyNeed > 0 ? monthlyNeed * monthsTarget : 0;
    const currentReserve = caixinhaTotal._sum.valueAdded ?? 0;
    const monthsCovered =
      monthlyNeed > 0 ? currentReserve / monthlyNeed : 0;
    const progressPercent =
      recommendedReserve > 0
        ? Math.min(100, (currentReserve / recommendedReserve) * 100)
        : 0;

    const message =
      recommendedReserve > 0
        ? `Você deveria ter R$ ${recommendedReserve.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })} de reserva. Baseado em gastos mensais de R$ ${monthlyNeed.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}.`
        : "Cadastre suas entradas recorrentes ou transações para calcular a reserva recomendada.";

    return {
      recommendedReserve: Math.round(recommendedReserve * 100) / 100,
      currentReserve: Math.round(currentReserve * 100) / 100,
      monthlyExpenses: Math.round(monthlyNeed * 100) / 100,
      monthsTarget,
      monthsCovered: Math.round(monthsCovered * 10) / 10,
      progressPercent: Math.round(progressPercent * 100) / 100,
      message,
      missing: Math.round(Math.max(0, recommendedReserve - currentReserve) * 100) / 100
    };
  }
}
