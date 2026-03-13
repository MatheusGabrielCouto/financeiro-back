import {
  Controller,
  Post,
  UseGuards,
  Body,
  Get,
  Param,
  Delete,
  Patch,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser } from 'src/auth/current-user-decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserPayload } from 'src/auth/jwt.strategy';
import { PrismaService } from 'src/prisma/prisma.service';
import { ZodValidationPipe } from 'src/pipes/zod-validation-pipe';
import { roundMoney } from 'src/utils/money';
import { z } from 'zod';

const createFuturePurchaseBodySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  value: z.coerce.number().positive('Valor deve ser positivo'),
  valueAdded: z.coerce.number().nonnegative().optional().default(0),
  dateAcquisition: z.coerce.string().transform((str) => new Date(str)),
});

const addValueBodySchema = z.object({
  value: z.coerce.number().positive('Valor deve ser positivo'),
});

const removeValueBodySchema = z.object({
  value: z.coerce.number().positive('Valor deve ser positivo'),
});

type CreateFuturePurchaseBody = z.infer<typeof createFuturePurchaseBodySchema>;
type AddValueBody = z.infer<typeof addValueBodySchema>;
type RemoveValueBody = z.infer<typeof removeValueBodySchema>;

const validationPipeCreateFuturePurchase = new ZodValidationPipe(createFuturePurchaseBodySchema);
const validationPipeAddValue = new ZodValidationPipe(addValueBodySchema);
const validationPipeRemoveValue = new ZodValidationPipe(removeValueBodySchema);

@Controller('/future-purchase')
export class FuturePurchaseController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload) {
    return this.prisma.futurePurchase.findMany({
      where: { userId: user.sub },
      orderBy: { dateAcquisition: 'asc' },
    });
  }

  @Get('projection')
  @UseGuards(JwtAuthGuard)
  async projection(@CurrentUser() user: UserPayload) {
    const purchases = await this.prisma.futurePurchase.findMany({
      where: { userId: user.sub },
      orderBy: { dateAcquisition: 'asc' },
    });

    const depositTransactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.sub,
        type: 'DEBIT',
        message: { startsWith: 'Depósito na caixinha' },
      },
      select: { message: true, value: true, createdAt: true },
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return purchases.map((purchase) => {
      const remainingValue = purchase.value - purchase.valueAdded;
      const targetDate = new Date(purchase.dateAcquisition);
      targetDate.setHours(0, 0, 0, 0);

      let monthsUntilTarget =
        (targetDate.getFullYear() - now.getFullYear()) * 12 +
        (targetDate.getMonth() - now.getMonth());
      if (targetDate.getDate() < now.getDate()) monthsUntilTarget--;
      monthsUntilTarget = Math.max(0, monthsUntilTarget);

      const suggestedMonthlyToReachByDate =
        monthsUntilTarget > 0 && remainingValue > 0
          ? remainingValue / monthsUntilTarget
          : remainingValue;

      const depositsForPurchase = depositTransactions.filter(
        (t) => t.message === `Depósito na caixinha: ${purchase.name}`,
      );

      const totalDeposited = depositsForPurchase.reduce((s, t) => s + t.value, 0);
      const firstDeposit = depositsForPurchase.reduce(
        (min, t) =>
          !min || t.createdAt < min ? t.createdAt : min,
        null as Date | null,
      );

      let monthsWithDeposits = 0;
      if (firstDeposit && purchase.valueAdded > 0) {
        monthsWithDeposits =
          (now.getFullYear() - firstDeposit.getFullYear()) * 12 +
          (now.getMonth() - firstDeposit.getMonth());
        monthsWithDeposits = Math.max(1, monthsWithDeposits);
      }

      const averageMonthlyDeposit =
        monthsWithDeposits > 0 ? totalDeposited / monthsWithDeposits : 0;

      let projectedDate: Date | null = null;
      if (averageMonthlyDeposit > 0 && remainingValue > 0) {
        const monthsToReach = remainingValue / averageMonthlyDeposit;
        projectedDate = new Date(now.getFullYear(), now.getMonth() + Math.ceil(monthsToReach), 1);
      }

      const isGoalReached = purchase.valueAdded >= purchase.value;

      return {
        id: purchase.id,
        name: purchase.name,
        value: purchase.value,
        valueAdded: purchase.valueAdded,
        remainingValue,
        dateAcquisition: purchase.dateAcquisition,
        suggestedMonthlyToReachByDate: Math.round(suggestedMonthlyToReachByDate * 100) / 100,
        averageMonthlyDeposit: Math.round(averageMonthlyDeposit * 100) / 100,
        projectedDate,
        monthsUntilTarget,
        isGoalReached,
      };
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async find(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    const purchase = await this.prisma.futurePurchase.findFirst({
      where: { id, userId: user.sub },
    });

    if (!purchase) {
      throw new NotFoundException('Compra futura não encontrada');
    }

    return purchase;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserPayload,
    @Body(validationPipeCreateFuturePurchase) body: CreateFuturePurchaseBody,
  ) {
    const { name, value, valueAdded, dateAcquisition } = body;
    const amountToAdd = valueAdded ?? 0;

    if (amountToAdd > 0) {
      const userData = await this.prisma.user.findUnique({
        where: { id: user.sub },
      });

      if (!userData) {
        throw new NotFoundException('Usuário não encontrado');
      }

      if (userData.amount < amountToAdd) {
        throw new BadRequestException('Saldo em conta insuficiente');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.futurePurchase.create({
        data: {
          name,
          value: Number(value),
          valueAdded: amountToAdd,
          dateAcquisition: new Date(dateAcquisition),
          userId: user.sub,
        },
      });

      if (amountToAdd > 0) {
        const poupancaCategory = await tx.category.findFirst({
          where: { title: 'Poupança', userId: null },
        });
        const transaction = await tx.transaction.create({
          data: {
            value: amountToAdd,
            message: `Depósito na caixinha: ${name}`,
            type: 'DEBIT',
            userId: user.sub,
          },
        });
        if (poupancaCategory) {
          await tx.transactionOnCategory.create({
            data: {
              transactionId: transaction.id,
              categoryId: poupancaCategory.id,
            },
          });
        }

        const userInTx = await tx.user.findUnique({
          where: { id: user.sub },
          select: { amount: true },
        });
        if (userInTx) {
          const newAmount = roundMoney(userInTx.amount - amountToAdd);
          await tx.user.update({
            where: { id: user.sub },
            data: { amount: newAmount },
          });
        }
      }

      return purchase;
    });
  }

  @Patch(':id/add-value')
  @UseGuards(JwtAuthGuard)
  async addValue(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body(validationPipeAddValue) body: AddValueBody,
  ) {
    const purchase = await this.prisma.futurePurchase.findFirst({
      where: { id, userId: user.sub },
    });

    if (!purchase) {
      throw new NotFoundException('Compra futura não encontrada');
    }

    const userData = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });

    if (!userData) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (userData.amount < body.value) {
      throw new BadRequestException('Saldo em conta insuficiente');
    }

    return this.prisma.$transaction(async (tx) => {
      const poupancaCategory = await tx.category.findFirst({
        where: { title: 'Poupança', userId: null },
      });
      const transaction = await tx.transaction.create({
        data: {
          value: body.value,
          message: `Depósito na caixinha: ${purchase.name}`,
          type: 'DEBIT',
          userId: user.sub,
        },
      });
      if (poupancaCategory) {
        await tx.transactionOnCategory.create({
          data: {
            transactionId: transaction.id,
            categoryId: poupancaCategory.id,
          },
        });
      }

      const newAmount = roundMoney(userData.amount - body.value);
      await tx.user.update({
        where: { id: user.sub },
        data: { amount: newAmount },
      });

      return tx.futurePurchase.update({
        where: { id },
        data: {
          valueAdded: { increment: body.value },
        },
      });
    });
  }

  @Patch(':id/remove-value')
  @UseGuards(JwtAuthGuard)
  async removeValue(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body(validationPipeRemoveValue) body: RemoveValueBody,
  ) {
    const purchase = await this.prisma.futurePurchase.findFirst({
      where: { id, userId: user.sub },
    });

    if (!purchase) {
      throw new NotFoundException('Compra futura não encontrada');
    }

    if (purchase.valueAdded < body.value) {
      throw new BadRequestException(
        `Saldo na caixinha insuficiente. Disponível: R$ ${purchase.valueAdded.toFixed(2)}`,
      );
    }

    const userData = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { amount: true },
    });
    if (!userData) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          value: body.value,
          message: `Retirada da caixinha: ${purchase.name}`,
          type: 'CREDIT',
          userId: user.sub,
        },
      });

      const newAmount = roundMoney(userData.amount + body.value);
      await tx.user.update({
        where: { id: user.sub },
        data: { amount: newAmount },
      });

      return tx.futurePurchase.update({
        where: { id },
        data: {
          valueAdded: { decrement: body.value },
        },
      });
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    const purchase = await this.prisma.futurePurchase.findFirst({
      where: { id, userId: user.sub },
    });

    if (!purchase) {
      throw new NotFoundException('Compra futura não encontrada');
    }

    if (purchase.valueAdded > 0) {
      throw new BadRequestException(
        'Remova o saldo da caixinha antes de excluir. Use o endpoint PATCH /:id/remove-value.',
      );
    }

    await this.prisma.futurePurchase.delete({ where: { id } });

    return { message: 'Compra futura excluída com sucesso' };
  }
}
