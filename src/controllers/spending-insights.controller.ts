import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";

const THRESHOLD_PERCENT = 20;
const MONTHS_HISTORY = 6;

@Controller("/spending-insights")
export class SpendingInsightsController {
  constructor(private prisma: PrismaService) {}

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

    const [currentMonthTx, historicalTx] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          userId: user.sub,
          type: { in: ["PAY", "DEBIT"] },
          createdAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }
        },
        include: {
          categories: { include: { category: true } }
        }
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: user.sub,
          type: { in: ["PAY", "DEBIT"] },
          createdAt: { gte: startOfHistory, lt: startOfCurrentMonth }
        },
        include: {
          categories: { include: { category: true } }
        }
      })
    ]);

    const currentByCategory = this.buildSpentByCategory(currentMonthTx);
    const historicalByCategory = this.buildSpentByCategory(historicalTx);

    const monthsWithData = this.countMonthsWithTransactions(historicalTx);
    const avgByCategory = new Map<string, number>();
    historicalByCategory.forEach((total, categoryId) => {
      avgByCategory.set(
        categoryId,
        monthsWithData > 0 ? total / monthsWithData : 0
      );
    });

    const totalCurrent = Array.from(currentByCategory.values()).reduce(
      (sum, v) => sum + v,
      0
    );
    const totalHistorical = Array.from(historicalByCategory.values()).reduce(
      (sum, v) => sum + v,
      0
    );
    const avgMonthlySpending =
      monthsWithData > 0 ? totalHistorical / monthsWithData : 0;

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

    const insights: string[] = categoryAlerts.map((a) => a.message);
    insights.push(
      `Seu gasto médio mensal é R$ ${avgMonthlySpending.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    );

    return {
      period: {
        month: monthNumber,
        year: yearNumber,
        label: `${monthNumber.toString().padStart(2, "0")}/${yearNumber}`
      },
      insights,
      averageMonthlySpending: Math.round(avgMonthlySpending * 100) / 100,
      currentMonthSpending: Math.round(totalCurrent * 100) / 100,
      categoryAlerts,
      monthsAnalyzed: monthsWithData
    };
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
