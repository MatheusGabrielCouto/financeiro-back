import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";

const DEFAULT_MONTHS = 6;
const MAX_MONTHS = 24;

const CAIXINHA_FILTER = {
  NOT: {
    OR: [
      { message: { startsWith: "Depósito na caixinha" } },
      { message: { startsWith: "Retirada da caixinha" } }
    ]
  }
};

@Controller("/reports")
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  @Get("expenses-by-category")
  @UseGuards(JwtAuthGuard)
  async getExpensesByCategory(
    @CurrentUser() user: UserPayload,
    @Query("months") monthsParam?: string
  ) {
    const months = Math.min(
      MAX_MONTHS,
      Math.max(1, monthsParam ? parseInt(monthsParam, 10) : DEFAULT_MONTHS)
    );

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - months,
      1
    );

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.sub,
        type: { in: ["PAY", "DEBIT"] },
        createdAt: { gte: startDate },
        ...CAIXINHA_FILTER
      },
      include: {
        categories: { include: { category: true } }
      }
    });

    const byCategory = this.buildExpensesByCategory(transactions);
    const total = byCategory.reduce((s, c) => s + c.total, 0);

    return {
      period: { months, startDate, endDate: now },
      total: Math.round(total * 100) / 100,
      byCategory: byCategory.map((c) => ({
        ...c,
        total: Math.round(c.total * 100) / 100,
        percentage: total > 0 ? Math.round((c.total / total) * 10000) / 100 : 0
      }))
    };
  }

  @Get("expenses-by-month")
  @UseGuards(JwtAuthGuard)
  async getExpensesByMonth(
    @CurrentUser() user: UserPayload,
    @Query("months") monthsParam?: string
  ) {
    const months = Math.min(
      MAX_MONTHS,
      Math.max(1, monthsParam ? parseInt(monthsParam, 10) : DEFAULT_MONTHS)
    );

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - months,
      1
    );

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.sub,
        type: { in: ["PAY", "DEBIT"] },
        createdAt: { gte: startDate },
        ...CAIXINHA_FILTER
      },
      select: { value: true, createdAt: true }
    });

    const byMonth = new Map<string, { label: string; total: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + i + 1, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      byMonth.set(key, {
        label: `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`,
        total: 0
      });
    }

    for (const tx of transactions) {
      const key = `${tx.createdAt.getFullYear()}-${tx.createdAt.getMonth()}`;
      const entry = byMonth.get(key);
      if (entry) entry.total += tx.value;
    }

    const data = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        ...v,
        total: Math.round(v.total * 100) / 100
      }));

    return {
      period: { months, startDate, endDate: now },
      byMonth: data
    };
  }

  @Get("evolution")
  @UseGuards(JwtAuthGuard)
  async getEvolution(
    @CurrentUser() user: UserPayload,
    @Query("months") monthsParam?: string
  ) {
    const months = Math.min(
      MAX_MONTHS,
      Math.max(1, monthsParam ? parseInt(monthsParam, 10) : DEFAULT_MONTHS)
    );

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - months,
      1
    );

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.sub,
        createdAt: { gte: startDate },
        ...CAIXINHA_FILTER
      },
      select: { value: true, type: true, createdAt: true }
    });

    const creditsByMonth = new Map<string, number>();
    const debitsByMonth = new Map<string, number>();

    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + i + 1, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      creditsByMonth.set(key, 0);
      debitsByMonth.set(key, 0);
    }

    for (const tx of transactions) {
      const key = `${tx.createdAt.getFullYear()}-${tx.createdAt.getMonth()}`;
      if (tx.type === "CREDIT") {
        creditsByMonth.set(key, (creditsByMonth.get(key) ?? 0) + tx.value);
      } else {
        debitsByMonth.set(key, (debitsByMonth.get(key) ?? 0) + tx.value);
      }
    }

    const data: Array<{
      label: string;
      month: number;
      year: number;
      income: number;
      expenses: number;
      net: number;
    }> = [];

    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + i + 1, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const income = creditsByMonth.get(key) ?? 0;
      const expenses = debitsByMonth.get(key) ?? 0;
      const net = income - expenses;

      data.push({
        label: `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`,
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        income: Math.round(income * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        net: Math.round(net * 100) / 100
      });
    }

    return {
      period: { months, startDate, endDate: now },
      monthly: data
    };
  }

  private buildExpensesByCategory(
    transactions: Array<{
      value: number;
      categories: Array<{ category: { id: string; title: string } }>;
    }>
  ): Array<{ id: string; title: string; total: number }> {
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
}
