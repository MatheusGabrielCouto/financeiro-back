import { Body, Controller, Get, NotFoundException, Post, UseGuards } from "@nestjs/common";
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
  categories: z.array(z.string().uuid()).optional()
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
  ) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.sub
      },
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
    const { message, type, value, categories } = body

    const findUser = await this.prisma.user.findUnique({
      where: {
        id: user.sub
      }
    })

    if (!findUser) {
      throw new NotFoundException('Usuário não encontrado!')
    }

    if (type === 'PAY' && findUser.amount - value < 0) {
      throw new NotFoundException('Saldo em conta insuficiente')
    }

    // 1️⃣ Criar a transação primeiro
    const transaction = await this.prisma.transaction.create({
      data: {
        value,
        message,
        type,
        userId: user.sub
      },
    });

    // 2️⃣ Atualizar o saldo do usuário
    await this.prisma.user.update({
      where: {
        id: user.sub
      },
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