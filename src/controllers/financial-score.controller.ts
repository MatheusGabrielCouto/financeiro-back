import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";
import { ReserveCalculationService } from "src/services/reserve-calculation.service";

@Controller("/financial-score")
export class FinancialScoreController {
  constructor(
    private prisma: PrismaService,
    private reserveCalculation: ReserveCalculationService
  ) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async getScore(@CurrentUser() user: UserPayload) {
    const [reserveData, installments] = await Promise.all([
      this.reserveCalculation.calculate(user.sub),
      this.prisma.installment.findMany({
        where: {
          debt: { userId: user.sub },
          status: "SCHEDULE"
        },
        select: { value: true }
      })
    ]);

    const {
      currentReserve: reserve,
      monthlyNeed: monthlyExpenses,
      monthlyRecurringIncome,
      monthsOfReserve
    } = reserveData;

    const totalDebt = installments.reduce((s, i) => s + i.value, 0);
    const monthlyObligations =
      reserveData.monthlyRecurringPayments + reserveData.avgMonthlyDebts;

    const debtScore = this.calcDebtScore(totalDebt, monthlyRecurringIncome);
    const expenseScore = this.calcExpenseScore(
      monthlyExpenses,
      monthlyRecurringIncome
    );
    const incomeScore = this.calcIncomeScore(monthlyRecurringIncome);
    const reserveScore = this.calcReserveScore(monthsOfReserve, reserve);

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
        variable: reserveData.monthlyVariableExpenses,
        recurring: reserveData.monthlyRecurringPayments,
        debts: reserveData.avgMonthlyDebts,
        score: Math.round(expenseScore * 100) / 100,
        maxScore: 25,
        description:
          monthlyRecurringIncome === 0
            ? "Cadastre sua renda para análise"
            : `Gastos médios de R$ ${monthlyExpenses.toLocaleString("pt-BR", {
                minimumFractionDigits: 2
              })}/mês`
      },
      income: {
        monthly: monthlyRecurringIncome,
        score: Math.round(incomeScore * 100) / 100,
        maxScore: 25,
        description:
          monthlyRecurringIncome === 0
            ? "Cadastre entradas recorrentes"
            : `Renda de R$ ${monthlyRecurringIncome.toLocaleString("pt-BR", {
                minimumFractionDigits: 2
              })}/mês`
      },
      reserve: {
        amount: reserve,
        monthsOfReserve,
        score: Math.round(reserveScore * 100) / 100,
        maxScore: 25,
        description:
          reserve <= 0
            ? "Sem reserva de emergência"
            : `Reserva: R$ ${reserve.toLocaleString("pt-BR", {
                minimumFractionDigits: 2
              })} (${monthsOfReserve.toFixed(1)} meses)`
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

  private calcReserveScore(monthsOfReserve: number, reserve: number): number {
    if (monthsOfReserve >= 6) return 25;
    if (monthsOfReserve >= 3) return 20;
    if (monthsOfReserve >= 1) return 10;
    if (reserve > 0) return 5;
    return 0;
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
