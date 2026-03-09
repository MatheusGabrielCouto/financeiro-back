import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const createTransactionBodySchema = z.object({
  message: z.string(),
  value: z.number(),
  type: z.enum(['DEBIT', 'CREDIT', 'PAY']),
  categories: z.array(z.string().uuid()).optional(),
  jointAccountId: z.string().uuid().optional(),
})

type CreateTransactionBody = z.infer<typeof createTransactionBodySchema>
const validationPipeCreateTransaction = new ZodValidationPipe(createTransactionBodySchema)

@Controller('/transaction')
export class TransactionController {
  constructor(private prisma: PrismaService) {}
  
  @Get('')
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: UserPayload,
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('message') message: string,
    @Query('valueMin') valueMin: string,
    @Query('valueMax') valueMax: string,
    @Query('jointAccountId') jointAccountId: string,
  ) {
    const monthNumber = month ? parseInt(month, 10) : Number((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const yearNumber = year ? parseInt(year, 10) : Number(new Date().getFullYear());

    const where: Record<string, unknown> = {
      userId: user.sub,
      createdAt: {
        gte: new Date(yearNumber, monthNumber - 1, 1),
        lt: new Date(yearNumber, monthNumber, 1)
      }
    };

    if (jointAccountId) {
      const membership = await this.prisma.userJointAccount.findUnique({
        where: { userId_jointAccountId: { userId: user.sub, jointAccountId } },
      });
      if (!membership) throw new NotFoundException('Conta conjunta não encontrada');
      where.jointAccountId = jointAccountId;
    } else {
      where.jointAccountId = null;
    }

    if (message) {
      where.message = { contains: message, mode: 'insensitive' };
    }

    if (valueMin || valueMax) {
      where.value = {};
      if (valueMin) (where.value as { gte?: number }).gte = parseFloat(valueMin);
      if (valueMax) (where.value as { lte?: number }).lte = parseFloat(valueMax);
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: {
        categories: {
          select: {
            category: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  
    const formattedTransactions = transactions.map(transaction => ({
      ...transaction,
      categories: transaction.categories.map(c => c.category)
    }));

    return formattedTransactions
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserPayload,
    @Body(validationPipeCreateTransaction) body: CreateTransactionBody
  ) {
    const { message, type, value, categories, jointAccountId } = body

    const isJoint = !!jointAccountId;

    if (isJoint) {
      const membership = await this.prisma.userJointAccount.findUnique({
        where: { userId_jointAccountId: { userId: user.sub, jointAccountId: jointAccountId! } },
        include: { jointAccount: true },
      });
      if (!membership) throw new NotFoundException('Conta conjunta não encontrada');

      const balance = membership.jointAccount.amount;
      if (type === 'PAY' && balance - value < 0) {
        throw new BadRequestException('Saldo em conta insuficiente');
      }

      const transaction = await this.prisma.transaction.create({
        data: {
          value,
          message,
          type,
          userId: user.sub,
          jointAccountId,
        },
      });

      const newBalance = type === 'PAY' || type === 'DEBIT' ? balance - value : balance + value;
      await this.prisma.jointAccount.update({
        where: { id: jointAccountId },
        data: { amount: newBalance },
      });

      if (categories?.length) {
        const existingCategories = await this.prisma.category.findMany({
          where: { id: { in: categories } },
          select: { id: true },
        });
        if (existingCategories.length !== categories.length) {
          throw new NotFoundException('Uma ou mais categorias não existem');
        }
        await this.prisma.transactionOnCategory.createMany({
          data: existingCategories.map((cat) => ({
            transactionId: transaction.id,
            categoryId: cat.id,
          })),
        });
      }

      return this.prisma.transaction.findUnique({
        where: { id: transaction.id },
        include: { categories: { include: { category: true } } },
      });
    }

    const findUser = await this.prisma.user.findUnique({
      where: { id: user.sub }
    });

    if (!findUser) throw new NotFoundException('Usuário não encontrado!');
    if (type === 'PAY' && findUser.amount - value < 0) {
      throw new BadRequestException('Saldo em conta insuficiente');
    }

    const transaction = await this.prisma.transaction.create({
      data: { value, message, type, userId: user.sub },
    });

    await this.prisma.user.update({
      where: { id: user.sub },
      data: {
        amount: type === 'PAY' || type === 'DEBIT'
          ? findUser.amount - value
          : findUser.amount + value
      }
    });

    // 3️⃣ Vincular categorias se fornecidas
    if (categories && categories.length > 0) {
      const existingCategories = await this.prisma.category.findMany({
        where: { id: { in: categories } },
        select: { id: true },
      });

      const existingCategoryIds = existingCategories.map(cat => cat.id);

      if (existingCategoryIds.length !== categories.length) {
        throw new NotFoundException('Uma ou mais categorias não existem');
      }

      await this.prisma.transactionOnCategory.createMany({
        data: existingCategoryIds.map(categoryId => ({
          transactionId: transaction.id,
          categoryId,
        })),
      });
    }

    // 4️⃣ Retornar a transação com as categorias associadas
    return this.prisma.transaction.findUnique({
      where: { id: transaction.id },
      include: { categories: { include: { category: true } } },
    });
  }

}