import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const createRecurringIncomeBodySchema = z.object({
  title: z.string(),
  value: z.number().positive(),
  dayOfMonth: z.number().min(1).max(31)
});

type CreateRecurringIncomeBody = z.infer<typeof createRecurringIncomeBodySchema>;
const createRecurringIncomeBodyPipe = new ZodValidationPipe(
  createRecurringIncomeBodySchema
);

@Controller("/recurring-income")
export class RecurringIncomeController {
  constructor(private prisma: PrismaService) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload) {
    return this.prisma.recurringIncome.findMany({
      where: { userId: user.sub },
      omit: { userId: true },
      orderBy: { createdAt: "desc" }
    });
  }

  @Post("")
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserPayload,
    @Body(createRecurringIncomeBodyPipe) body: CreateRecurringIncomeBody
  ) {
    const { title, value, dayOfMonth } = body;

    return this.prisma.recurringIncome.create({
      data: {
        title,
        value,
        dayOfMonth,
        userId: user.sub
      }
    });
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async delete(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string
  ) {
    const recurringIncome = await this.prisma.recurringIncome.findUnique({
      where: { id }
    });

    if (!recurringIncome) {
      throw new NotFoundException("Entrada recorrente não encontrada");
    }

    if (recurringIncome.userId !== user.sub) {
      throw new ForbiddenException(
        "Você não tem permissão para deletar esta entrada recorrente"
      );
    }

    await this.prisma.recurringIncome.delete({
      where: { id }
    });
  }
}
