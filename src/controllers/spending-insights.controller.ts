import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";
import { ReserveCalculationService } from "src/services/reserve-calculation.service";

const THRESHOLD_PERCENT = 15;
const MONTHS_HISTORY = 6;

@Controller("/spending-insights")
export class SpendingInsightsController {
  constructor(
    private prisma: PrismaService,
    private reserveCalculation: ReserveCalculationService
  ) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async getInsights(
    @CurrentUser() user: UserPayload,
    @Query("month") month?: string,
    @Query("year") year?: string,
    @Query("threshold") threshold?: string
  ) {
    const now = new Date();
    const monthNumber = month ? parseInt(month, 10) : now.getMonth() + 1;
    const yearNumber = year ? parseInt(year, 10) : now.getFullYear();
    const thresholdPercent = threshold ? parseInt(threshold, 10) : THRESHOLD_PERCENT;

    const startOfCurrentMonth = new Date(yearNumber, monthNumber - 1, 1);
    const endOfCurrentMonth = new Date(
      yearNumber,
      monthNumber,
      0,
      23,
      59,
      59
    );
    const startOfHistory = new Date(yearNumber, monthNumber - 1 - MONTHS_HISTORY, 1);

    const [reserveData, currentMonthTx, historicalTx, recurringPayments, installmentsOfMonth, totalDebtResult] =
      await Promise.all([
        this.reserveCalculation.calculate(user.sub),
        this.prisma.transaction.findMany({
          where: {
            userId: user.sub,
            type: { in: ["PAY", "DEBIT"] },
            createdAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
            NOT: {
              OR: [
                { message: { startsWith: "Depósito na caixinha" } },
                { message: { startsWith: "Retirada da caixinha" } }
              ]
            }
          },
          include: {
            categories: { include: { category: true } }
          }
        }),
        this.prisma.transaction.findMany({
          where: {
            userId: user.sub,
            type: { in: ["PAY", "DEBIT"] },
            createdAt: { gte: startOfHistory, lt: startOfCurrentMonth },
            NOT: {
              OR: [
                { message: { startsWith: "Depósito na caixinha" } },
                { message: { startsWith: "Retirada da caixinha" } }
              ]
            }
          },
          include: {
            categories: { include: { category: true } }
          }
        }),
        this.prisma.recurringPayment.findMany({
          where: { userId: user.sub }
        }),
        this.prisma.installment.findMany({
          where: {
            debt: { userId: user.sub, cardId: null },
            status: "SCHEDULE",
            dateTransaction: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }
          },
          select: { value: true }
        }),
        this.prisma.installment.aggregate({
          where: {
            debt: { userId: user.sub, cardId: null },
            status: "SCHEDULE"
          },
          _sum: { value: true }
        })
      ]);

    const currentByCategory = this.buildSpentByCategory(currentMonthTx);
    const historicalByCategory = this.buildSpentByCategory(historicalTx);

    let monthsWithData = this.countMonthsWithTransactions(historicalTx);
    const hasCurrentMonthData = currentMonthTx.length > 0;
    if (monthsWithData === 0 && hasCurrentMonthData) {
      monthsWithData = 1;
    } else if (hasCurrentMonthData) {
      const currentMonthKey = `${yearNumber}-${monthNumber - 1}`;
      const historicalMonths = new Set(
        historicalTx.map(
          (t) =>
            `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`
        )
      );
      if (!historicalMonths.has(currentMonthKey)) {
        monthsWithData += 1;
      }
    }

    const mergedByCategory = new Map<string, number>();
    historicalByCategory.forEach((total, id) =>
      mergedByCategory.set(id, (mergedByCategory.get(id) ?? 0) + total)
    );
    currentByCategory.forEach((total, id) =>
      mergedByCategory.set(id, (mergedByCategory.get(id) ?? 0) + total)
    );

    const avgByCategory = new Map<string, number>();
    mergedByCategory.forEach((total, categoryId) => {
      avgByCategory.set(
        categoryId,
        monthsWithData > 0 ? total / monthsWithData : 0
      );
    });

    const variableTxCurrent = currentMonthTx
      .filter((t) => !t.message.includes("(pagamento recorrente)"))
      .reduce((sum, t) => sum + t.value, 0);
    const recurringTotal = recurringPayments.reduce((s, r) => s + r.value, 0);
    const installmentsTotal = installmentsOfMonth.reduce((s, i) => s + i.value, 0);
    const currentMonthSpending =
      variableTxCurrent + installmentsTotal;

    const avgMonthlySpending =
      reserveData.monthlyVariableExpenses + reserveData.avgMonthlyDebts;

    const categoryAlerts: Array<{
      categoryId: string;
      categoryTitle: string;
      currentSpent: number;
      averageSpent: number;
      percentageIncrease: number;
      message: string;
    }> = [];

    const allCategoryIds = new Set([
      ...currentByCategory.keys(),
      ...avgByCategory.keys()
    ]);

    const categoryTitles = this.buildCategoryTitles(
      currentMonthTx,
      historicalTx
    );

    for (const categoryId of allCategoryIds) {
      const current = currentByCategory.get(categoryId) ?? 0;
      const average = avgByCategory.get(categoryId) ?? 0;

      if (average > 0 && current > average) {
        const percentageIncrease =
          ((current - average) / average) * 100;
        if (percentageIncrease >= thresholdPercent) {
          const title =
            categoryTitles.get(categoryId) ??
            (categoryId === "__uncategorized__" ? "Sem categoria" : "Desconhecida");
          categoryAlerts.push({
            categoryId,
            categoryTitle: title,
            currentSpent: Math.round(current * 100) / 100,
            averageSpent: Math.round(average * 100) / 100,
            percentageIncrease: Math.round(percentageIncrease),
            message: `Você gastou ${Math.round(percentageIncrease)}% mais em ${title}`
          });
        }
      }
    }

    categoryAlerts.sort((a, b) => b.percentageIncrease - a.percentageIncrease);

    const totalDebt = totalDebtResult._sum.value ?? 0;
    const uncategorizedSpent = currentByCategory.get("__uncategorized__") ?? 0;

    const insights: string[] = categoryAlerts.map((a) => a.message);

    if (avgMonthlySpending > 0 && currentMonthSpending > avgMonthlySpending) {
      const pctAbove =
        ((currentMonthSpending - avgMonthlySpending) / avgMonthlySpending) * 100;
      insights.unshift(
        `Seus gastos deste mês estão ${Math.round(pctAbove)}% acima da sua média (R$ ${(currentMonthSpending - avgMonthlySpending).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} a mais)`
      );
    }

    insights.push(
      `Seu gasto médio mensal é R$ ${avgMonthlySpending.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    );

    const tips = this.buildTips({
      reserveData,
      currentMonthSpending,
      avgMonthlySpending,
      totalDebt,
      uncategorizedSpent,
      variableTxCurrent,
      recurringTotal,
      installmentsTotal,
      monthlyIncome: reserveData.monthlyRecurringIncome
    });

    return {
      period: {
        month: monthNumber,
        year: yearNumber,
        label: `${monthNumber.toString().padStart(2, "0")}/${yearNumber}`
      },
      insights,
      averageMonthlySpending: Math.round(avgMonthlySpending * 100) / 100,
      currentMonthSpending: Math.round(currentMonthSpending * 100) / 100,
      averageBreakdown: {
        variable: Math.round(reserveData.monthlyVariableExpenses * 100) / 100,
        recurring: Math.round(reserveData.monthlyRecurringPayments * 100) / 100,
        installments: Math.round(reserveData.avgMonthlyDebts * 100) / 100
      },
      currentBreakdown: {
        variable: Math.round(variableTxCurrent * 100) / 100,
        recurring: Math.round(recurringTotal * 100) / 100,
        installments: Math.round(installmentsTotal * 100) / 100
      },
      categoryAlerts,
      monthsAnalyzed: monthsWithData,
      tips
    };
  }

  private buildTips(ctx: {
    reserveData: {
      monthsOfReserve: number;
      currentReserve: number;
      monthlyRecurringPayments: number;
      monthlyVariableExpenses: number;
      avgMonthlyDebts: number;
    };
    currentMonthSpending: number;
    avgMonthlySpending: number;
    totalDebt: number;
    uncategorizedSpent: number;
    variableTxCurrent: number;
    recurringTotal: number;
    installmentsTotal: number;
    monthlyIncome: number;
  }): string[] {
    const tips: string[] = [];

    if (ctx.reserveData.monthsOfReserve < 3 && ctx.reserveData.currentReserve >= 0) {
      tips.push("Construa uma reserva de emergência de pelo menos 3 meses de gastos");
    }

    if (ctx.totalDebt > 0) {
      tips.push("Priorize a quitação de dívidas para reduzir juros e melhorar sua saúde financeira");
    }

    if (ctx.avgMonthlySpending > 0 && ctx.currentMonthSpending > ctx.avgMonthlySpending * 1.1) {
      tips.push("Revise seus gastos variáveis e identifique onde pode cortar despesas");
    }

    if (ctx.uncategorizedSpent > 0 && ctx.variableTxCurrent > 0) {
      const pctUncategorized =
        (ctx.uncategorizedSpent / ctx.variableTxCurrent) * 100;
      if (pctUncategorized > 30) {
        tips.push("Categorize suas transações para ter visibilidade de onde seu dinheiro está indo");
      }
    }

    if (
      ctx.monthlyIncome > 0 &&
      ctx.recurringTotal + ctx.reserveData.avgMonthlyDebts > ctx.monthlyIncome * 0.5
    ) {
      tips.push("Suas obrigações fixas consomem mais de 50% da renda. Avalie renegociar ou cortar gastos");
    }

    if (ctx.reserveData.monthlyRecurringPayments > 0 && ctx.monthlyIncome > 0) {
      const recurringPct =
        (ctx.reserveData.monthlyRecurringPayments / ctx.monthlyIncome) * 100;
      if (recurringPct > 40) {
        tips.push("Pagamentos recorrentes estão altos. Revise assinaturas e contas fixas");
      }
    }

    if (tips.length === 0) {
      tips.push("Sua situação financeira está sob controle. Continue acompanhando seus gastos");
    }

    return tips.slice(0, 5);
  }

  private buildSpentByCategory(
    transactions: Array<{
      value: number;
      categories: Array<{ category: { id: string } }>;
    }>
  ): Map<string, number> {
    const result = new Map<string, number>();

    for (const tx of transactions) {
      const valuePerCategory =
        tx.categories.length > 0 ? tx.value / tx.categories.length : tx.value;

      if (tx.categories.length === 0) {
        const key = "__uncategorized__";
        result.set(key, (result.get(key) ?? 0) + tx.value);
      } else {
        for (const { category } of tx.categories) {
          result.set(
            category.id,
            (result.get(category.id) ?? 0) + valuePerCategory
          );
        }
      }
    }

    return result;
  }

  private countMonthsWithTransactions(
    transactions: Array<{ createdAt: Date }>
  ): number {
    const months = new Set(
      transactions.map((t) => `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`)
    );
    return months.size;
  }

  @Get("debt-planner")
  @UseGuards(JwtAuthGuard)
  async getDebtPlanner(
    @CurrentUser() user: UserPayload,
    @Query("effectiveMonthlyPayment") effectiveMonthlyPaymentParam?: string
  ) {
    const effectiveMonthlyPaymentInput = effectiveMonthlyPaymentParam
      ? parseFloat(effectiveMonthlyPaymentParam)
      : 0;

    const debts = await this.prisma.debt.findMany({
      where: { userId: user.sub, cardId: null },
      include: {
        installments: {
          where: { status: "SCHEDULE" },
          orderBy: { dateTransaction: "asc" }
        }
      }
    });

    const debtsWithBalance = debts
      .filter((d) => d.installments.length > 0)
      .map((d) => {
        const remainingValue = d.installments.reduce((s, i) => s + i.value, 0);
        const minPayment =
          d.installments.length > 0 ? remainingValue / d.installments.length : 0;
        return {
          id: d.id,
          title: d.title,
          remainingValue,
          minPayment,
          interestRate: d.interestRate ?? 0,
          installmentsCount: d.installments.length
        };
      });

    const totalDebt = debtsWithBalance.reduce((s, d) => s + d.remainingValue, 0);
    const totalMinPayment = debtsWithBalance.reduce(
      (s, d) => s + d.minPayment,
      0
    );

    const effectiveMonthlyPayment =
      effectiveMonthlyPaymentInput > 0
        ? effectiveMonthlyPaymentInput
        : totalMinPayment;
    const insufficientPayment =
      effectiveMonthlyPayment < totalMinPayment &&
      totalMinPayment > 0;

    if (debtsWithBalance.length === 0) {
      return {
        message: "Você não possui dívidas pendentes",
        totalDebt: 0,
        snowball: null,
        avalanche: null
      };
    }

    const snowball = this.simulatePayoff(
      debtsWithBalance,
      effectiveMonthlyPayment,
      "snowball"
    );
    const avalanche = this.simulatePayoff(
      debtsWithBalance,
      effectiveMonthlyPayment,
      "avalanche"
    );

    const monthsToComplete = Math.min(
      snowball.monthsToComplete,
      avalanche.monthsToComplete
    );

    return {
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalMinPayment: Math.round(totalMinPayment * 100) / 100,
      monthlyPayment: effectiveMonthlyPayment,
      insufficientPayment,
      warning: insufficientPayment
        ? `O valor informado (R$ ${effectiveMonthlyPayment.toFixed(2)}) é menor que o total dos pagamentos mínimos (R$ ${totalMinPayment.toFixed(2)}). Será aplicado o valor disponível em cada mês.`
        : undefined,
      message: `Você quitará todas as dívidas em ${monthsToComplete} meses`,
      debts: debtsWithBalance.map((d) => ({
        id: d.id,
        title: d.title,
        remainingValue: Math.round(d.remainingValue * 100) / 100,
        minPayment: Math.round(d.minPayment * 100) / 100,
        interestRate: d.interestRate ?? 0
      })),
      snowball: {
        ...snowball,
        description:
          "Método bola de neve: quite primeiro as dívidas menores para ganhar motivação"
      },
      avalanche: {
        ...avalanche,
        description:
          "Método avalanche: quite primeiro as dívidas com maior taxa de juros para reduzir o custo total"
      }
    };
  }

  private simulatePayoff(
    debts: Array<{
      id: string;
      title: string;
      remainingValue: number;
      minPayment: number;
      interestRate?: number;
    }>,
    monthlyPayment: number,
    method: "snowball" | "avalanche"
  ): {
    monthsToComplete: number;
    payoffOrder: Array<{ title: string; month: number }>;
    monthlyBreakdown: Array<{ month: number; paid: number; remaining: number }>;
  } {
    const effectivePayment =
      monthlyPayment > 0
        ? monthlyPayment
        : debts.reduce((s, d) => s + d.minPayment, 0);

    const sorted =
      method === "snowball"
        ? [...debts].sort((a, b) => a.remainingValue - b.remainingValue)
        : [...debts].sort((a, b) => {
            const rateA = a.interestRate ?? 0;
            const rateB = b.interestRate ?? 0;
            if (rateA !== rateB) return rateB - rateA;
            return b.remainingValue - a.remainingValue;
          });

    const balances = new Map(debts.map((d) => [d.id, d.remainingValue]));
    const payoffOrder: Array<{ title: string; month: number }> = [];
    const monthlyBreakdown: Array<{
      month: number;
      paid: number;
      remaining: number;
    }> = [];

    let month = 0;

    while (Array.from(balances.values()).some((v) => v > 0.01)) {
      let available = effectivePayment;
      let totalPaid = 0;

      for (const debt of sorted) {
        const balance = balances.get(debt.id) ?? 0;
        if (balance <= 0) continue;

        const minPay = Math.min(
          balance,
          debt.minPayment,
          Math.max(0, available)
        );
        if (minPay > 0) {
          balances.set(debt.id, balance - minPay);
          available -= minPay;
          totalPaid += minPay;
        }
      }

      for (const debt of sorted) {
        if (available <= 0.01) break;
        const balance = balances.get(debt.id) ?? 0;
        if (balance <= 0) continue;

        const extraPay = Math.min(balance, available);
        balances.set(debt.id, balance - extraPay);
        available -= extraPay;
        totalPaid += extraPay;

        if ((balances.get(debt.id) ?? 0) <= 0.01) {
          payoffOrder.push({ title: debt.title, month });
        }
      }

      const totalRemaining = Array.from(balances.values()).reduce(
        (s, v) => s + (v > 0 ? v : 0),
        0
      );

      monthlyBreakdown.push({
        month,
        paid: Math.round(totalPaid * 100) / 100,
        remaining: Math.round(totalRemaining * 100) / 100
      });

      month++;
      if (month > 600) break;
    }

    return {
      monthsToComplete: month,
      payoffOrder,
      monthlyBreakdown: monthlyBreakdown.slice(0, 24)
    };
  }

  private buildCategoryTitles(
    currentTx: Array<{
      categories: Array<{ category: { id: string; title: string } }>;
    }>,
    historicalTx: Array<{
      categories: Array<{ category: { id: string; title: string } }>;
    }>
  ): Map<string, string> {
    const map = new Map<string, string>();
    map.set("__uncategorized__", "Sem categoria");
    for (const tx of [...currentTx, ...historicalTx]) {
      for (const { category } of tx.categories) {
        map.set(category.id, category.title);
      }
    }
    return map;
  }
}
