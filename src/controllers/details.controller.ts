import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";

@Controller("/details")
export class DetailsController {
  constructor(private prisma: PrismaService) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async getDetails(
    @CurrentUser() user: UserPayload,
    @Query("month") month?: string,
    @Query("year") year?: string
  ) {
    const now = new Date();
    const monthNumber = month ? parseInt(month, 10) : now.getMonth() + 1;
    const yearNumber = year ? parseInt(year, 10) : now.getFullYear();

    const startOfMonth = new Date(yearNumber, monthNumber - 1, 1);
    const endOfMonth = new Date(yearNumber, monthNumber, 0, 23, 59, 59);

    const [recurringIncomes, recurringPayments, installments, transactions, creditTransactions, debts, caixinhaTransactions, caixinhaTotal] =
      await Promise.all([
        this.prisma.recurringIncome.findMany({
          where: { userId: user.sub }
        }),
        this.prisma.recurringPayment.findMany({
          where: { userId: user.sub }
        }),
        this.prisma.installment.findMany({
          where: {
            debt: { userId: user.sub, cardId: null },
            dateTransaction: { gte: startOfMonth, lte: endOfMonth }
          },
          include: { debt: true }
        }),
        this.prisma.transaction.findMany({
          where: {
            userId: user.sub,
            type: { in: ["PAY", "DEBIT"] },
            createdAt: { gte: startOfMonth, lte: endOfMonth },
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
            type: "CREDIT",
            createdAt: { gte: startOfMonth, lte: endOfMonth },
            NOT: {
              OR: [
                { message: { contains: "(entrada recorrente)" } },
                { message: { startsWith: "Retirada da caixinha" } }
              ]
            }
          },
          select: { value: true }
        }),
        this.prisma.debt.findMany({
          where: { userId: user.sub, cardId: null },
          include: {
            installments: {
              where: { status: "SCHEDULE" },
              orderBy: { dateTransaction: "asc" }
            }
          }
        }),
        this.prisma.transaction.findMany({
          where: {
            userId: user.sub,
            createdAt: { gte: startOfMonth, lte: endOfMonth },
            OR: [
              { type: "DEBIT", message: { startsWith: "Depósito na caixinha" } },
              { type: "CREDIT", message: { startsWith: "Retirada da caixinha" } }
            ]
          }
        }),
        this.prisma.futurePurchase.aggregate({
          where: { userId: user.sub },
          _sum: { valueAdded: true }
        })
      ]);

    const recurringIncomeTotal = recurringIncomes.reduce(
      (sum, inc) => sum + inc.value,
      0
    );

    const recurringPaymentsTotal = recurringPayments.reduce(
      (sum, p) => sum + p.value,
      0
    );

    const debtsOfMonth = installments.reduce((sum, inst) => sum + inst.value, 0);

    const paidRecurring = transactions
      .filter((t) => t.message.includes("(pagamento recorrente)"))
      .reduce((sum, t) => sum + t.value, 0);
    const paidDebts = installments
      .filter((i) => i.status === "PAY")
      .reduce((sum, i) => sum + i.value, 0);

    const expensesByCategory = this.buildExpensesByCategory(transactions);
    const totalExpenses = transactions.reduce((sum, t) => sum + t.value, 0);
    const totalIncomeFromTransactions = creditTransactions.reduce(
      (sum, t) => sum + t.value,
      0
    );

    const debtProjections = this.buildDebtProjections(debts);

    const recurringIncomeBreakdown = recurringIncomes.map((inc) => ({
      id: inc.id,
      title: inc.title,
      value: inc.value,
      dayOfMonth: inc.dayOfMonth
    }));

    const recurringPaymentsBreakdown = recurringPayments.map((p) => ({
      id: p.id,
      title: p.title,
      value: p.value,
      dayOfMonth: p.dayOfMonth,
      paidThisMonth: !!(
        p.lastProcessedAt &&
        p.lastProcessedAt.getMonth() === monthNumber - 1 &&
        p.lastProcessedAt.getFullYear() === yearNumber
      )
    }));

    const debtsBreakdown = installments.map((inst) => ({
      id: inst.id,
      debtTitle: inst.debt.title,
      value: inst.value,
      date: inst.dateTransaction,
      status: inst.status
    }));

    const caixinhaDeposits = caixinhaTransactions
      .filter((t) => t.type === "DEBIT")
      .reduce((sum, t) => sum + t.value, 0);

    const caixinhaWithdrawals = caixinhaTransactions
      .filter((t) => t.type === "CREDIT")
      .reduce((sum, t) => sum + t.value, 0);

    const caixinhaNetInMonth = caixinhaDeposits - caixinhaWithdrawals;

    const caixinhaBreakdown = caixinhaTransactions.map((t) => ({
      id: t.id,
      type: t.type === "DEBIT" ? "deposit" : "withdrawal",
      value: t.value,
      message: t.message,
      createdAt: t.createdAt
    }));

    return {
      period: {
        month: monthNumber,
        year: yearNumber,
        label: `${monthNumber.toString().padStart(2, "0")}/${yearNumber}`
      },
      summary: {
        recurringIncome: recurringIncomeTotal,
        outrasEntradas: totalIncomeFromTransactions,
        totalIncomeFromTransactions,
        totalIncome:
          recurringIncomeTotal + totalIncomeFromTransactions,
        recurringPayments: recurringPaymentsTotal,
        debts: debtsOfMonth,
        caixinhaDeposits,
        caixinhaWithdrawals,
        caixinhaNetInMonth,
        caixinhaTotal: caixinhaTotal._sum.valueAdded ?? 0,
        netExpected:
          recurringIncomeTotal - recurringPaymentsTotal - debtsOfMonth,
        totalExpenses,
        balanceAfterExpenses:
          recurringIncomeTotal +
          totalIncomeFromTransactions -
          totalExpenses -
          (recurringPaymentsTotal - paidRecurring) -
          (debtsOfMonth - paidDebts) -
          caixinhaNetInMonth
      },
      recurringIncomeBreakdown,
      recurringPaymentsBreakdown,
      debtsBreakdown,
      expensesByCategory,
      debtProjections,
      caixinhaBreakdown
    };
  }

  private buildExpensesByCategory(
    transactions: Array<{
      value: number;
      categories: Array<{ category: { id: string; title: string } }>;
    }>
  ) {
    const categoryMap = new Map<string, { id: string; title: string; total: number }>();

    for (const tx of transactions) {
      const valuePerCategory =
        tx.categories.length > 0 ? tx.value / tx.categories.length : tx.value;

      if (tx.categories.length === 0) {
        const key = "__uncategorized__";
        const existing = categoryMap.get(key);
        if (existing) {
          existing.total += tx.value;
        } else {
          categoryMap.set(key, {
            id: key,
            title: "Sem categoria",
            total: tx.value
          });
        }
      } else {
        for (const { category } of tx.categories) {
          const existing = categoryMap.get(category.id);
          if (existing) {
            existing.total += valuePerCategory;
          } else {
            categoryMap.set(category.id, {
              id: category.id,
              title: category.title,
              total: valuePerCategory
            });
          }
        }
      }
    }

    return Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);
  }

  private buildDebtProjections(
    debts: Array<{
      id: string;
      title: string;
      recurrence: string;
      installments: Array<{ value: number; dateTransaction: Date }>;
    }>
  ) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return debts
      .filter((d) => d.installments.length > 0)
      .map((debt) => {
        const remainingValue = debt.installments.reduce(
          (sum, i) => sum + i.value,
          0
        );
        const lastInstallment = debt.installments[debt.installments.length - 1];
        const avgValue =
          debt.installments.length > 0
            ? remainingValue / debt.installments.length
            : 0;
        const monthsToComplete = this.estimateMonthsToComplete(
          debt.installments,
          currentYear,
          currentMonth
        );
        const suggestedMonthlyPayment =
          monthsToComplete > 0 ? remainingValue / monthsToComplete : remainingValue;

        return {
          debtId: debt.id,
          title: debt.title,
          recurrence: debt.recurrence,
          remainingInstallments: debt.installments.length,
          remainingValue,
          averageInstallmentValue: Math.round(avgValue * 100) / 100,
          lastInstallmentDate: lastInstallment?.dateTransaction,
          monthsToComplete,
          suggestedMonthlyPayment: Math.round(suggestedMonthlyPayment * 100) / 100
        };
      })
      .sort((a, b) => a.remainingValue - b.remainingValue);
  }

  @Get("projection")
  @UseGuards(JwtAuthGuard)
  async getAnnualProjection(
    @CurrentUser() user: UserPayload,
    @Query("year") year?: string
  ) {
    const now = new Date();
    const yearNumber = year ? parseInt(year, 10) : now.getFullYear();

    const startOfYear = new Date(yearNumber, 0, 1);
    const endOfYear = new Date(yearNumber, 11, 31, 23, 59, 59);

    const [
      recurringIncomes,
      recurringPayments,
      installments,
      expenseTransactions,
      creditTransactions,
      expenseTransactionsInYear,
      creditTransactionsInYear
    ] = await Promise.all([
      this.prisma.recurringIncome.findMany({
        where: { userId: user.sub }
      }),
      this.prisma.recurringPayment.findMany({
        where: { userId: user.sub }
      }),
      this.prisma.installment.findMany({
        where: {
          debt: { userId: user.sub, cardId: null },
          dateTransaction: { gte: startOfYear, lte: endOfYear }
        }
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: user.sub,
          type: { in: ["PAY", "DEBIT"] },
          createdAt: { lt: startOfYear },
          NOT: {
            OR: [
              { message: { startsWith: "Depósito na caixinha" } },
              { message: { startsWith: "Retirada da caixinha" } }
            ]
          }
        },
        select: { value: true, createdAt: true }
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: user.sub,
          type: "CREDIT",
          createdAt: { lt: startOfYear },
          NOT: {
            OR: [
              { message: { contains: "(entrada recorrente)" } },
              { message: { startsWith: "Retirada da caixinha" } }
            ]
          }
        },
        select: { value: true, createdAt: true }
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: user.sub,
          jointAccountId: null,
          type: { in: ["PAY", "DEBIT"] },
          createdAt: { gte: startOfYear, lte: endOfYear },
          NOT: {
            OR: [
              { message: { startsWith: "Depósito na caixinha" } },
              { message: { startsWith: "Retirada da caixinha" } }
            ]
          }
        },
        select: { value: true, message: true, createdAt: true }
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: user.sub,
          jointAccountId: null,
          type: "CREDIT",
          createdAt: { gte: startOfYear, lte: endOfYear },
          NOT: {
            OR: [
              { message: { contains: "(entrada recorrente)" } },
              { message: { startsWith: "Retirada da caixinha" } }
            ]
          }
        },
        select: { value: true, createdAt: true }
      })
    ]);

    const recurringIncomeMonthly = recurringIncomes.reduce(
      (sum, inc) => sum + inc.value,
      0
    );
    const recurringPaymentsMonthly = recurringPayments.reduce(
      (sum, p) => sum + p.value,
      0
    );

    const installmentsByMonth = new Map<number, number>();
    const paidDebtsByMonth = new Map<number, number>();
    for (let m = 1; m <= 12; m++) {
      installmentsByMonth.set(m, 0);
      paidDebtsByMonth.set(m, 0);
    }
    for (const inst of installments) {
      const month = inst.dateTransaction.getMonth() + 1;
      installmentsByMonth.set(
        month,
        (installmentsByMonth.get(month) ?? 0) + inst.value
      );
      if (inst.status === "PAY") {
        paidDebtsByMonth.set(
          month,
          (paidDebtsByMonth.get(month) ?? 0) + inst.value
        );
      }
    }

    const incomeByMonth = new Map<number, number>();
    const expenseByMonth = new Map<number, number>();
    const paidRecurringByMonth = new Map<number, number>();
    for (let m = 1; m <= 12; m++) {
      incomeByMonth.set(m, 0);
      expenseByMonth.set(m, 0);
      paidRecurringByMonth.set(m, 0);
    }
    for (const t of creditTransactionsInYear) {
      const month = t.createdAt.getMonth() + 1;
      incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + t.value);
    }
    for (const t of expenseTransactionsInYear) {
      const month = t.createdAt.getMonth() + 1;
      expenseByMonth.set(month, (expenseByMonth.get(month) ?? 0) + t.value);
      if (t.message?.includes("(pagamento recorrente)")) {
        paidRecurringByMonth.set(
          month,
          (paidRecurringByMonth.get(month) ?? 0) + t.value
        );
      }
    }

    const pastMonthsWithData = new Set(
      expenseTransactions.map((t) =>
        `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`
      )
    ).size;
    const totalPastExpenses = expenseTransactions.reduce(
      (sum, t) => sum + t.value,
      0
    );
    const avgHistoricalExpenses =
      pastMonthsWithData > 0 ? totalPastExpenses / pastMonthsWithData : 0;

    const pastMonthsWithIncome = new Set(
      creditTransactions.map((t) =>
        `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`
      )
    ).size;
    const totalPastIncome = creditTransactions.reduce(
      (sum, t) => sum + t.value,
      0
    );
    const avgHistoricalIncome =
      pastMonthsWithIncome > 0 ? totalPastIncome / pastMonthsWithIncome : 0;

    const monthly: Array<{
      month: number;
      label: string;
      income: number;
      expenses: {
        recurringPayments: number;
        debts: number;
        historicalAverage: number;
        total: number;
      };
      net: number;
    }> = [];

    let annualIncome = 0;
    let annualRecurringPayments = 0;
    let annualDebts = 0;
    let annualHistoricalAverage = 0;

    for (let month = 1; month <= 12; month++) {
      const debtsOfMonth = installmentsByMonth.get(month) ?? 0;
      const actualIncomeInMonth = incomeByMonth.get(month) ?? 0;
      const actualExpensesInMonth = expenseByMonth.get(month) ?? 0;
      const paidRecurringInMonth = paidRecurringByMonth.get(month) ?? 0;
      const paidDebtsInMonth = paidDebtsByMonth.get(month) ?? 0;
      const actualOtherExpenses = Math.max(
        0,
        actualExpensesInMonth - paidRecurringInMonth - paidDebtsInMonth
      );
      const otherIncome =
        actualIncomeInMonth > 0 ? actualIncomeInMonth : avgHistoricalIncome;
      const income = recurringIncomeMonthly + otherIncome;
      const recurringPayments = recurringPaymentsMonthly;
      const totalExpenses =
        recurringPayments +
        debtsOfMonth +
        (actualExpensesInMonth > 0 ? actualOtherExpenses : avgHistoricalExpenses);
      const net = income - totalExpenses;

      monthly.push({
        month,
        label: `${month.toString().padStart(2, "0")}/${yearNumber}`,
        income: Math.round(income * 100) / 100,
        expenses: {
          recurringPayments,
          debts: debtsOfMonth,
          historicalAverage: Math.round(avgHistoricalExpenses * 100) / 100,
          total: Math.round(totalExpenses * 100) / 100
        },
        net: Math.round(net * 100) / 100
      });

      annualIncome += income;
      annualRecurringPayments += recurringPayments;
      annualDebts += debtsOfMonth;
      annualHistoricalAverage += avgHistoricalExpenses;
    }

    const annualHistoricalIncome = avgHistoricalIncome * 12;

    return {
      year: yearNumber,
      monthly,
      totals: {
        annualIncome: Math.round(annualIncome * 100) / 100,
        annualRecurringPayments,
        annualDebts,
        annualHistoricalIncome: Math.round(annualHistoricalIncome * 100) / 100,
        annualHistoricalExpenses: Math.round(annualHistoricalAverage * 100) / 100,
        annualProjectedExpenses: Math.round(
          (annualRecurringPayments + annualDebts + annualHistoricalAverage) *
            100
        ) / 100,
        annualNet: Math.round(
          (annualIncome -
            annualRecurringPayments -
            annualDebts -
            annualHistoricalAverage) *
            100
        ) / 100
      }
    };
  }

  private estimateMonthsToComplete(
    installments: Array<{ dateTransaction: Date }>,
    currentYear: number,
    currentMonth: number
  ): number {
    if (installments.length === 0) return 0;
    const last = installments[installments.length - 1];
    const lastYear = last.dateTransaction.getFullYear();
    const lastMonth = last.dateTransaction.getMonth();
    const months =
      (lastYear - currentYear) * 12 + (lastMonth - currentMonth) + 1;
    return Math.max(1, months);
  }
}
