import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";

const MONTHS_HISTORY = 6;

@Controller("/financial-score")
export class FinancialScoreController {
  constructor(private prisma: PrismaService) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async getScore(@CurrentUser() user: UserPayload) {
    const now = new Date();
    const startOfHistory = new Date(
      now.getFullYear(),
      now.getMonth() - MONTHS_HISTORY,
      1
    );

    const [caixinhaTotal, recurringIncomes, recurringPayments, installments, transactions] =
      await Promise.all([
        this.prisma.futurePurchase.aggregate({
          where: { userId: user.sub },
          _sum: { valueAdded: true }
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
            status: "SCHEDULE"
          }
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
    const monthlyRecurringPayments = recurringPayments.reduce(
      (s, r) => s + r.value,
      0
    );
    const totalDebt = installments.reduce((s, i) => s + i.value, 0);

    const debtByMonth = new Map<string, number>();
    for (const inst of installments) {
      const key = `${inst.dateTransaction.getFullYear()}-${inst.dateTransaction.getMonth()}`;
      debtByMonth.set(key, (debtByMonth.get(key) ?? 0) + inst.value);
    }
    const monthlyDebtPayment =
      debtByMonth.size > 0
        ? [...debtByMonth.values()].reduce((a, b) => a + b, 0) /
          debtByMonth.size
        : 0;
    const reserve = caixinhaTotal._sum.valueAdded ?? 0;

    const monthsWithExpenses = new Set(
      transactions.map((t) => `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`)
    ).size;
    const totalExpenses = transactions.reduce((s, t) => s + t.value, 0);
    const monthlyExpenses =
      monthsWithExpenses > 0 ? totalExpenses / monthsWithExpenses : 0;

    const monthlyObligations = monthlyRecurringPayments + monthlyDebtPayment;

    const debtScore = this.calcDebtScore(totalDebt, monthlyIncome);
    const expenseScore = this.calcExpenseScore(monthlyExpenses, monthlyIncome);
    const incomeScore = this.calcIncomeScore(monthlyIncome);
    const reserveScore = this.calcReserveScore(
      reserve,
      monthlyExpenses,
      monthlyIncome
    );

    const totalScore = Math.round(
      Math.min(100, Math.max(0, debtScore + expenseScore + incomeScore + reserveScore))
    );

    const breakdown = {
      debts: {
        totalDebt,
        monthlyObligations: Math.round(monthlyObligations * 100) / 100,
        score: Math.round(debtScore * 100) / 100,
        maxScore: 25,
        description:
          totalDebt === 0
            ? "Sem dívidas pendentes"
            : `Dívida total de R$ ${totalDebt.toLocaleString("pt-BR", {
                minimumFractionDigits: 2
              })}`
      },
      expenses: {
        monthlyAverage: monthlyExpenses,
        score: Math.round(expenseScore * 100) / 100,
        maxScore: 25,
        description:
          monthlyIncome === 0
            ? "Cadastre sua renda para análise"
            : `Gastos médios de R$ ${monthlyExpenses.toLocaleString("pt-BR", {
                minimumFractionDigits: 2
              })}/mês`
      },
      income: {
        monthly: monthlyIncome,
        score: Math.round(incomeScore * 100) / 100,
        maxScore: 25,
        description:
          monthlyIncome === 0
            ? "Cadastre entradas recorrentes"
            : `Renda de R$ ${monthlyIncome.toLocaleString("pt-BR", {
                minimumFractionDigits: 2
              })}/mês`
      },
      reserve: {
        amount: reserve,
        monthsOfReserve: this.getMonthsOfReserve(
          reserve,
          monthlyExpenses,
          monthlyIncome
        ),
        score: Math.round(reserveScore * 100) / 100,
        maxScore: 25,
        description:
          reserve <= 0
            ? "Sem valor em caixinhas"
            : `Reserva em caixinhas: R$ ${reserve.toLocaleString("pt-BR", {
                minimumFractionDigits: 2
              })} (${this.getMonthsOfReserve(reserve, monthlyExpenses, monthlyIncome).toFixed(1)} meses)`
      }
    };

    return {
      score: totalScore,
      rating: this.getRating(totalScore),
      breakdown,
      tips: this.getTips(totalScore, breakdown)
    };
  }

  private calcDebtScore(totalDebt: number, monthlyIncome: number): number {
    if (monthlyIncome <= 0) return 12.5;
    const debtToIncomeAnnual = totalDebt / (monthlyIncome * 12);
    if (debtToIncomeAnnual <= 0) return 25;
    if (debtToIncomeAnnual >= 2) return 0;
    return Math.max(0, 25 - debtToIncomeAnnual * 12.5);
  }

  private calcExpenseScore(
    monthlyExpenses: number,
    monthlyIncome: number
  ): number {
    if (monthlyIncome <= 0) return 12.5;
    const expenseRatio = monthlyExpenses / monthlyIncome;
    if (expenseRatio <= 0.5) return 25;
    if (expenseRatio >= 1.2) return 0;
    return Math.max(0, 25 - (expenseRatio - 0.5) * 35.7);
  }

  private calcIncomeScore(monthlyIncome: number): number {
    if (monthlyIncome <= 0) return 0;
    if (monthlyIncome >= 3000) return 25;
    if (monthlyIncome >= 1000) return 20;
    if (monthlyIncome >= 500) return 15;
    return 10;
  }

  private calcReserveScore(
    reserve: number,
    monthlyExpenses: number,
    monthlyIncome: number
  ): number {
    const months = this.getMonthsOfReserve(reserve, monthlyExpenses, monthlyIncome);
    if (months >= 6) return 25;
    if (months >= 3) return 20;
    if (months >= 1) return 10;
    if (reserve > 0) return 5;
    return 0;
  }

  private getMonthsOfReserve(
    reserve: number,
    monthlyExpenses: number,
    monthlyIncome: number
  ): number {
    const monthlyNeed =
      monthlyExpenses > 0 ? monthlyExpenses : monthlyIncome * 0.7;
    if (monthlyNeed <= 0) return reserve > 0 ? 12 : 0;
    return reserve / monthlyNeed;
  }

  private getRating(score: number): string {
    if (score >= 80) return "Excelente";
    if (score >= 60) return "Bom";
    if (score >= 40) return "Regular";
    if (score >= 20) return "Atenção";
    return "Crítico";
  }

  private getTips(
    score: number,
    breakdown: {
      debts: { totalDebt: number };
      expenses: { monthlyAverage: number };
      income: { monthly: number };
      reserve: { amount: number; monthsOfReserve: number };
    }
  ): string[] {
    const tips: string[] = [];

    if (breakdown.debts.totalDebt > 0 && score < 70) {
      tips.push("Priorize a quitação de dívidas para melhorar seu score");
    }
    if (breakdown.reserve.monthsOfReserve < 3) {
      tips.push("Construa uma reserva de emergência de pelo menos 3 meses");
    }
    if (breakdown.income.monthly === 0) {
      tips.push("Cadastre suas entradas recorrentes para uma análise completa");
    }
    if (breakdown.expenses.monthlyAverage > breakdown.income.monthly * 0.7 && breakdown.income.monthly > 0) {
      tips.push("Revise seus gastos para manter margem de segurança");
    }
    if (score >= 80) {
      tips.push("Parabéns! Sua saúde financeira está em dia");
    }

    return tips.slice(0, 4);
  }
}
