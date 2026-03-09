import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  UseGuards
} from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const upsertBudgetBodySchema = z.object({
  categoryId: z.string().uuid(),
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2100),
  amount: z.number().positive()
});

type UpsertBudgetBody = z.infer<typeof upsertBudgetBodySchema>;
const upsertBudgetBodyPipe = new ZodValidationPipe(upsertBudgetBodySchema);

@Controller("/budget")
export class BudgetController {
  constructor(private prisma: PrismaService) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: UserPayload,
    @Query("month") month?: string,
    @Query("year") year?: string
  ) {
    const now = new Date();
    const monthNumber = month ? parseInt(month, 10) : now.getMonth() + 1;
    const yearNumber = year ? parseInt(year, 10) : now.getFullYear();

    const startOfMonth = new Date(yearNumber, monthNumber - 1, 1);
    const endOfMonth = new Date(yearNumber, monthNumber, 0, 23, 59, 59);

    const [budgets, transactions] = await Promise.all([
      this.prisma.categoryBudget.findMany({
        where: { userId: user.sub, month: monthNumber, year: yearNumber },
        include: { category: true }
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: user.sub,
          type: { in: ["PAY", "DEBIT"] },
          createdAt: { gte: startOfMonth, lte: endOfMonth }
        },
        include: {
          categories: { include: { category: true } }
        }
      })
    ]);

    const spentByCategory = this.buildSpentByCategory(transactions);

    return budgets.map((budget) => {
      const spent = spentByCategory.get(budget.categoryId) ?? 0;
      const remaining = Math.max(0, budget.amount - spent);
      const percentageUsed =
        budget.amount > 0 ? Math.min(100, (spent / budget.amount) * 100) : 0;

      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryTitle: budget.category.title,
        amount: budget.amount,
        spent: Math.round(spent * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        percentageUsed: Math.round(percentageUsed * 100) / 100,
        month: budget.month,
        year: budget.year
      };
    });
  }

  @Put("")
  @UseGuards(JwtAuthGuard)
  async upsert(
    @CurrentUser() user: UserPayload,
    @Body(upsertBudgetBodyPipe) body: UpsertBudgetBody
  ) {
    const { categoryId, month, year, amount } = body;

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      throw new NotFoundException("Categoria não encontrada");
    }

    if (category.userId !== user.sub) {
      throw new ForbiddenException(
        "Você não tem permissão para definir orçamento nesta categoria"
      );
    }

    const budget = await this.prisma.categoryBudget.upsert({
      where: {
        userId_categoryId_month_year: {
          userId: user.sub,
          categoryId,
          month,
          year
        }
      },
      create: {
        userId: user.sub,
        categoryId,
        month,
        year,
        amount
      },
      update: { amount }
    });

    return budget;
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async delete(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string
  ) {
    const budget = await this.prisma.categoryBudget.findUnique({
      where: { id }
    });

    if (!budget) {
      throw new NotFoundException("Orçamento não encontrado");
    }

    if (budget.userId !== user.sub) {
      throw new ForbiddenException(
        "Você não tem permissão para deletar este orçamento"
      );
    }

    await this.prisma.categoryBudget.delete({
      where: { id }
    });
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
}
