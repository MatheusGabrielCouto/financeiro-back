import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const MONTHS_HISTORY = 6;
const IMPACT_LIMIT_SAFE = 20;
const IMPACT_LIMIT_CAUTION = 30;

const simulateBodySchema = z.object({
  name: z.string().min(1).max(200),
  installments: z.number().min(1).max(60),
  value: z.number().positive()
});

type SimulateBody = z.infer<typeof simulateBodySchema>;
const simulateBodyPipe = new ZodValidationPipe(simulateBodySchema);

@Controller("/installment-simulation")
export class InstallmentSimulationController {
  constructor(private prisma: PrismaService) {}

  @Post("")
  @UseGuards(JwtAuthGuard)
  async simulate(
    @CurrentUser() user: UserPayload,
    @Body(simulateBodyPipe) body: SimulateBody
  ) {
    const { name, installments, value } = body;
    const monthlyPayment = value;
    const totalValue = value * installments;

    const now = new Date();
    const startOfHistory = new Date(
      now.getFullYear(),
      now.getMonth() - MONTHS_HISTORY,
      1
    );

    const [recurringIncomes, recurringPayments, installmentsData, transactions] =
      await Promise.all([
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

    const debtByMonth = new Map<string, number>();
    for (const inst of installmentsData) {
      const key = `${inst.dateTransaction.getFullYear()}-${inst.dateTransaction.getMonth()}`;
      debtByMonth.set(key, (debtByMonth.get(key) ?? 0) + inst.value);
    }
    const monthlyDebtPayment =
      debtByMonth.size > 0
        ? [...debtByMonth.values()].reduce((a, b) => a + b, 0) /
          debtByMonth.size
        : 0;

    const monthsWithExpenses = new Set(
      transactions.map(
        (t) => `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`
      )
    ).size;
    const totalExpenses = transactions.reduce((s, t) => s + t.value, 0);
    const monthlyExpenses =
      monthsWithExpenses > 0 ? totalExpenses / monthsWithExpenses : 0;

    const monthlyObligations = monthlyRecurringPayments + monthlyDebtPayment;
    const totalDebt = installmentsData.reduce((s, i) => s + i.value, 0);
    const monthlySurplus = monthlyIncome - monthlyObligations - monthlyExpenses;

    const impactPercent =
      monthlyIncome > 0
        ? Math.round((monthlyPayment / monthlyIncome) * 10000) / 100
        : 0;

    const surplusAfterParcel =
      monthlySurplus > 0 ? monthlySurplus - monthlyPayment : -monthlyPayment;

    const canAfford = monthlySurplus >= monthlyPayment;
    const impactSafe = impactPercent <= IMPACT_LIMIT_SAFE;
    const hasDebt = totalDebt > 0;
    const hasIncome = monthlyIncome > 0;

    let debtScore = 12.5;
    if (monthlyIncome > 0 && totalDebt > 0) {
      const ratio = totalDebt / (monthlyIncome * 12);
      debtScore = ratio >= 2 ? 0 : Math.max(0, 25 - ratio * 12.5);
    } else if (totalDebt === 0) {
      debtScore = 25;
    }
    let expenseScore = 12.5;
    if (monthlyIncome > 0) {
      const ratio = monthlyExpenses / monthlyIncome;
      if (ratio <= 0.5) expenseScore = 25;
      else if (ratio >= 1.2) expenseScore = 0;
      else expenseScore = Math.max(0, 25 - (ratio - 0.5) * 35.7);
    }
    const incomeScore =
      monthlyIncome >= 3000 ? 25 : monthlyIncome >= 1000 ? 20 : monthlyIncome >= 500 ? 15 : 10;
    const financialScore = Math.round(
      Math.min(100, Math.max(0, debtScore + expenseScore + incomeScore + 12.5))
    );

    let recommendation: "approved" | "caution" | "rejected";
    let message: string;

    if (!hasIncome) {
      recommendation = "rejected";
      message =
        "Cadastre suas entradas recorrentes para uma análise completa.";
    } else if (!canAfford) {
      recommendation = "rejected";
      message = `Você não tem margem para esta parcela. Sobram R$ ${Math.round(monthlySurplus * 100) / 100}/mês, mas a parcela seria R$ ${monthlyPayment.toFixed(2)}.`;
    } else if (impactPercent > IMPACT_LIMIT_CAUTION) {
      recommendation = "rejected";
      message = `A parcela consumiria ${impactPercent}% da sua renda. Recomendamos que parcelamentos não ultrapassem ${IMPACT_LIMIT_CAUTION}%.`;
    } else if (financialScore < 40 && hasDebt) {
      recommendation = "caution";
      message =
        "Seu score financeiro está baixo e você já possui dívidas. Recomendamos melhorar sua saúde financeira antes de assumir novas parcelas.";
    } else if (hasDebt && surplusAfterParcel < monthlyIncome * 0.2) {
      recommendation = "caution";
      message =
        "Você já possui dívidas. Após esta parcela, sobraria pouco para imprevistos. Considere quitar dívidas antes.";
    } else if (!impactSafe) {
      recommendation = "caution";
      message = `A parcela representa ${impactPercent}% da sua renda. Dentro do limite, mas fique atento ao orçamento.`;
    } else {
      recommendation = "approved";
      message = `Você tem margem para esta compra. Após a parcela, sobrariam R$ ${Math.round(surplusAfterParcel * 100) / 100}/mês.`;
    }

    return {
      simulation: {
        name,
        installments,
        monthlyPayment: Math.round(monthlyPayment * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100
      },
      impact: {
        percentOfIncome: impactPercent,
        description: `${impactPercent}% da renda`
      },
      userSituation: {
        monthlyIncome: Math.round(monthlyIncome * 100) / 100,
        monthlyObligations: Math.round(monthlyObligations * 100) / 100,
        monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
        monthlySurplus: Math.round(monthlySurplus * 100) / 100,
        surplusAfterParcel: Math.round(surplusAfterParcel * 100) / 100,
        totalDebt: Math.round(totalDebt * 100) / 100,
        financialScore
      },
      recommendation: {
        status: recommendation,
        canAfford,
        message
      }
    };
  }
}
