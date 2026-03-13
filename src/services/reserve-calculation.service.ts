import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

const MONTHS_HISTORY = 12;

export interface ReserveCalculationResult {
  currentReserve: number;
  monthlyNeed: number;
  monthlyIncome: number;
  monthlyRecurringIncome: number;
  monthlyOtherIncome: number;
  monthlyVariableExpenses: number;
  monthlyRecurringPayments: number;
  avgMonthlyDebts: number;
  monthsOfReserve: number;
}

@Injectable()
export class ReserveCalculationService {
  constructor(private prisma: PrismaService) {}

  async calculate(userId: string): Promise<ReserveCalculationResult> {
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

    const [userData, recurringIncomes, recurringPayments, installmentsData, transactions, creditTransactions] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { amount: true }
        }),
        this.prisma.recurringIncome.findMany({
          where: { userId }
        }),
        this.prisma.recurringPayment.findMany({
          where: { userId }
        }),
        this.prisma.installment.findMany({
          where: {
            debt: { userId },
            status: "SCHEDULE",
            dateTransaction: { gte: now, lte: endOfNext12Months }
          },
          select: { value: true, dateTransaction: true }
        }),
        this.prisma.transaction.findMany({
          where: {
            userId,
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
        }),
        this.prisma.transaction.findMany({
          where: {
            userId,
            type: "CREDIT",
            createdAt: { gte: startOfHistory },
            NOT: { message: { contains: "(entrada recorrente)" } }
          },
          select: { value: true, createdAt: true }
        })
      ]);

    const recurringIncome = recurringIncomes.reduce((s, r) => s + r.value, 0);
    const monthsWithIncome = new Set(
      creditTransactions.map(
        (t) => `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`
      )
    ).size;
    const totalOtherIncome = creditTransactions.reduce((s, t) => s + t.value, 0);
    const avgMonthlyOtherIncome =
      monthsWithIncome > 0 ? totalOtherIncome / monthsWithIncome : 0;
    const monthlyIncome = recurringIncome + avgMonthlyOtherIncome;
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

    const currentReserve = userData?.amount ?? 0;
    const monthsOfReserve =
      fallbackMonthlyNeed > 0 ? currentReserve / fallbackMonthlyNeed : 0;

    return {
      currentReserve,
      monthlyNeed: fallbackMonthlyNeed,
      monthlyIncome,
      monthlyRecurringIncome: recurringIncome,
      monthlyOtherIncome: avgMonthlyOtherIncome,
      monthlyVariableExpenses,
      monthlyRecurringPayments,
      avgMonthlyDebts,
      monthsOfReserve
    };
  }
}
