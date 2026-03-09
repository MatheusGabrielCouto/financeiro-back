import {
  BadRequestException,
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

const createRecurringPaymentBodySchema = z.object({
  title: z.string(),
  value: z.number().positive(),
  dayOfMonth: z.number().min(1).max(31),
  categoryId: z.string().uuid().nullable().optional()
});

type CreateRecurringPaymentBody = z.infer<
  typeof createRecurringPaymentBodySchema
>;
const createRecurringPaymentBodyPipe = new ZodValidationPipe(
  createRecurringPaymentBodySchema
);

@Controller("/recurring-payment")
export class RecurringPaymentController {
  constructor(private prisma: PrismaService) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload) {
    return this.prisma.recurringPayment.findMany({
      where: { userId: user.sub },
      include: { category: true },
      orderBy: { createdAt: "desc" }
    });
  }

  @Post("")
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserPayload,
    @Body(createRecurringPaymentBodyPipe) body: CreateRecurringPaymentBody
  ) {
    const { title, value, dayOfMonth, categoryId } = body;

    if (categoryId) {
      const category = await this.prisma.category.findFirst({
        where: {
          id: categoryId,
          OR: [{ userId: null }, { userId: user.sub }]
        }
      });
      if (!category) throw new NotFoundException("Categoria não encontrada");
    }

    return this.prisma.recurringPayment.create({
      data: {
        title,
        value,
        dayOfMonth,
        categoryId: categoryId ?? null,
        userId: user.sub
      }
    });
  }

  @Post(":id/pay")
  @UseGuards(JwtAuthGuard)
  async pay(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string
  ) {
    const recurringPayment = await this.prisma.recurringPayment.findUnique({
      where: { id }
    });

    if (!recurringPayment) {
      throw new NotFoundException("Pagamento recorrente não encontrado");
    }

    if (recurringPayment.userId !== user.sub) {
      throw new ForbiddenException(
        "Você não tem permissão para pagar este item"
      );
    }

    const now = new Date();
    const alreadyProcessed =
      recurringPayment.lastProcessedAt &&
      recurringPayment.lastProcessedAt.getMonth() === now.getMonth() &&
      recurringPayment.lastProcessedAt.getFullYear() === now.getFullYear();

    if (alreadyProcessed) {
      throw new NotFoundException(
        "Parcela deste mês já foi paga"
      );
    }

    const userData = await this.prisma.user.findUnique({
      where: { id: user.sub }
    });

    if (!userData) {
      throw new NotFoundException("Usuário não encontrado");
    }

    if (userData.amount - recurringPayment.value < 0) {
      throw new BadRequestException("Saldo em conta insuficiente");
    }

    await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          value: recurringPayment.value,
          message: `${recurringPayment.title} (pagamento recorrente)`,
          type: "PAY",
          isRecurring: true,
          userId: user.sub
        }
      });

      if (recurringPayment.categoryId) {
        await tx.transactionOnCategory.create({
          data: {
            transactionId: transaction.id,
            categoryId: recurringPayment.categoryId
          }
        });
      }

      await tx.user.update({
        where: { id: user.sub },
        data: { amount: { decrement: recurringPayment.value } }
      });

      await tx.recurringPayment.update({
        where: { id },
        data: { lastProcessedAt: now }
      });
    });

    return { success: true };
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async delete(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string
  ) {
    const recurringPayment = await this.prisma.recurringPayment.findUnique({
      where: { id }
    });

    if (!recurringPayment) {
      throw new NotFoundException("Pagamento recorrente não encontrado");
    }

    if (recurringPayment.userId !== user.sub) {
      throw new ForbiddenException(
        "Você não tem permissão para deletar este pagamento recorrente"
      );
    }

    await this.prisma.recurringPayment.delete({
      where: { id }
    });
  }
}
