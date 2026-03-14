import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { CurrentUser } from 'src/auth/current-user-decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserPayload } from 'src/auth/jwt.strategy';
import { PrismaService } from 'src/prisma/prisma.service';
import { ZodValidationPipe } from 'src/pipes/zod-validation-pipe';
import { GroceryService } from 'src/services/grocery.service';
import { roundMoney } from 'src/utils/money';
import { z } from 'zod';

const purchaseItemSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  quantity: z.coerce.number().int().positive(),
  price: z.coerce.number().nonnegative(),
});

const createPurchaseBodySchema = z.object({
  date: z.string().transform((str) => new Date(str)),
  items: z.array(purchaseItemSchema).min(1, 'Pelo menos um item é obrigatório'),
});

type CreatePurchaseBody = z.infer<typeof createPurchaseBodySchema>;

const createPurchasePipe = new ZodValidationPipe(createPurchaseBodySchema);

@Controller('/grocery-purchase')
export class GroceryPurchaseController {
  constructor(
    private prisma: PrismaService,
    private groceryService: GroceryService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserPayload,
    @Body(createPurchasePipe) body: CreatePurchaseBody,
  ) {
    const total = body.items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0,
    );
    const totalRounded = roundMoney(total);

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.groceryPurchase.create({
        data: {
          userId: user.sub,
          date: body.date,
          total: totalRounded,
        },
      });

      await tx.groceryPurchaseItem.createMany({
        data: body.items.map((item) => ({
          purchaseId: purchase.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
      });

      for (const item of body.items) {
        const existing = await tx.pantryItem.findFirst({
          where: {
            userId: user.sub,
            name: { equals: item.name, mode: 'insensitive' },
          },
        });

        const metrics = await this.groceryService.calculateConsumptionMetrics(
          tx,
          user.sub,
          item.name,
        );

        const pantryData = {
          quantity: existing ? existing.quantity + item.quantity : item.quantity,
          lastPurchaseDate: body.date,
          consumptionPerDay: metrics.consumptionPerDay,
          averageDurationDays: metrics.averageDurationDays,
        };

        if (existing) {
          await tx.pantryItem.update({
            where: { id: existing.id },
            data: pantryData,
          });
        } else {
          await tx.pantryItem.create({
            data: {
              userId: user.sub,
              name: item.name,
              ...pantryData,
            },
          });
        }
      }

      return tx.groceryPurchase.findUnique({
        where: { id: purchase.id },
        include: { items: true },
      });
    });
  }

  @Post(':id/transaction')
  @UseGuards(JwtAuthGuard)
  async createTransaction(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    const purchase = await this.prisma.groceryPurchase.findFirst({
      where: { id, userId: user.sub },
    });
    if (!purchase) throw new NotFoundException('Compra não encontrada');
    if (purchase.transactionId) {
      throw new BadRequestException(
        'Transação já gerada para esta compra',
      );
    }

    const userData = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });
    if (!userData) throw new NotFoundException('Usuário não encontrado');
    if (userData.amount < purchase.total) {
      throw new BadRequestException('Saldo em conta insuficiente');
    }

    const mercadoCategory = await this.prisma.category.findFirst({
      where: {
        OR: [
          { title: 'Mercado', userId: null },
          { title: 'Supermercado', userId: null },
        ],
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          value: purchase.total,
          message: 'Compra mercado',
          type: 'PAY',
          userId: user.sub,
        },
      });

      await tx.groceryPurchase.update({
        where: { id },
        data: { transactionId: transaction.id },
      });

      if (mercadoCategory) {
        await tx.transactionOnCategory.create({
          data: {
            transactionId: transaction.id,
            categoryId: mercadoCategory.id,
          },
        });
      }

      const newAmount = roundMoney(userData.amount - purchase.total);
      await tx.user.update({
        where: { id: user.sub },
        data: { amount: newAmount },
      });

      return tx.transaction.findUnique({
        where: { id: transaction.id },
        include: { categories: { select: { category: true } } },
      }).then((t) =>
        t ? { ...t, categories: t.categories.map((c) => c.category) } : t,
      );
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload) {
    const purchases = await this.prisma.groceryPurchase.findMany({
      where: { userId: user.sub },
      include: { items: true, transaction: true },
      orderBy: { date: 'desc' },
    });
    return purchases.map((p) => ({
      ...p,
      canCreateTransaction: !p.transactionId,
    }));
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async find(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    const purchase = await this.prisma.groceryPurchase.findFirst({
      where: { id, userId: user.sub },
      include: { items: true, transaction: true },
    });
    if (!purchase) throw new NotFoundException('Compra não encontrada');
    return {
      ...purchase,
      canCreateTransaction: !purchase.transactionId,
    };
  }
}
