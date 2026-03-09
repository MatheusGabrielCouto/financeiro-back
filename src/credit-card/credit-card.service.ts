import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { StatusInstallment } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class CreditCardService {
  constructor(private prisma: PrismaService) {}

  async ensureCardBelongsToUser(cardId: string, userId: string) {
    const card = await this.prisma.creditCard.findUnique({
      where: { id: cardId },
    });
    if (!card) throw new NotFoundException("Cartão não encontrado");
    if (card.userId !== userId) throw new ForbiddenException("Acesso negado");
    return card;
  }

  async list(userId: string) {
    return this.prisma.creditCard.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    userId: string,
    data: {
      name: string;
      brand?: string | null;
      limit: number;
      closingDay: number;
      dueDay: number;
      lastDigits?: string | null;
    }
  ) {
    return this.prisma.creditCard.create({
      data: {
        userId,
        name: data.name,
        brand: data.brand ?? null,
        limit: data.limit,
        closingDay: data.closingDay,
        dueDay: data.dueDay,
        lastDigits: data.lastDigits ?? null,
      },
    });
  }

  async delete(cardId: string, userId: string) {
    await this.ensureCardBelongsToUser(cardId, userId);
    return this.prisma.creditCard.delete({
      where: { id: cardId },
    });
  }

  async getInvoice(cardId: string, userId: string, month: number, year: number) {
    const card = await this.ensureCardBelongsToUser(cardId, userId);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const installments = await this.prisma.installment.findMany({
      where: {
        debt: { cardId },
        dateTransaction: { gte: startOfMonth, lte: endOfMonth },
      },
      include: {
        debt: { select: { title: true } },
      },
      orderBy: { dateTransaction: "asc" },
    });

    const total = installments.reduce((sum, i) => sum + i.value, 0);

    return {
      total,
      installments: installments.map((i) => ({
        id: i.id,
        value: i.value,
        status: i.status,
        order: i.order,
        dateTransaction: i.dateTransaction,
        debtTitle: i.debt.title,
      })),
      dueDay: card.dueDay,
      closingDay: card.closingDay,
    };
  }

  async getLimit(cardId: string, userId: string) {
    const card = await this.ensureCardBelongsToUser(cardId, userId);

    const result = await this.prisma.installment.aggregate({
      where: {
        debt: { cardId },
        status: { not: StatusInstallment.PAY },
      },
      _sum: { value: true },
    });

    const used = result._sum.value ?? 0;
    const available = Math.max(0, card.limit - used);

    return {
      limit: card.limit,
      used,
      available,
    };
  }

  private buildInstallmentsForPurchase(
    totalValue: number,
    installmentsCount: number,
    dueDay: number
  ) {
    const baseValue = Math.floor((totalValue / installmentsCount) * 100) / 100;
    const remainder = Math.round((totalValue - baseValue * installmentsCount) * 100) / 100;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let firstDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
    if (firstDue.getDate() !== dueDay) {
      firstDue = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    if (firstDue <= now) {
      firstDue = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
      if (firstDue.getDate() !== dueDay) {
        firstDue = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      }
    }

    return Array.from({ length: installmentsCount }, (_, i) => {
      const date = new Date(firstDue);
      date.setMonth(date.getMonth() + i);
      date.setDate(dueDay);
      if (date.getDate() !== dueDay) {
        date.setMonth(date.getMonth() + 1);
        date.setDate(0);
      }
      const value = i === installmentsCount - 1 ? baseValue + remainder : baseValue;
      return {
        value,
        status: StatusInstallment.SCHEDULE,
        order: i + 1,
        dateTransaction: date,
      };
    });
  }

  async createPurchase(
    cardId: string,
    userId: string,
    data: {
      title: string;
      description?: string | null;
      value: number;
      installmentsCount: number;
    }
  ) {
    const card = await this.ensureCardBelongsToUser(cardId, userId);
    const { title, description, value, installmentsCount } = data;

    if (installmentsCount < 1) {
      throw new BadRequestException("installmentsCount deve ser >= 1");
    }

    const installments = this.buildInstallmentsForPurchase(
      value,
      installmentsCount,
      card.dueDay
    );

    return this.prisma.debt.create({
      data: {
        title,
        description: description ?? "",
        userId,
        cardId,
        recurrence: "MONTHLY",
        installments: { create: installments },
      },
      include: {
        installments: { orderBy: { order: "asc" } },
      },
    });
  }

  async payInvoice(cardId: string, userId: string, month: number, year: number) {
    const card = await this.ensureCardBelongsToUser(cardId, userId);
    const invoice = await this.getInvoice(cardId, userId, month, year);

    if (invoice.total <= 0) {
      throw new BadRequestException("Nenhuma parcela a pagar nesta fatura");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    if (user.amount - invoice.total < 0) {
      throw new BadRequestException("Saldo em conta insuficiente");
    }

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          value: invoice.total,
          message: `Pagamento fatura ${card.name}`,
          type: "PAY",
          userId,
        },
      });

      await tx.installment.updateMany({
        where: {
          debt: { cardId },
          dateTransaction: { gte: startOfMonth, lte: endOfMonth },
          status: StatusInstallment.SCHEDULE,
        },
        data: { status: StatusInstallment.PAY },
      });

      await tx.user.update({
        where: { id: userId },
        data: { amount: { decrement: invoice.total } },
      });
    });

    return { paid: invoice.total };
  }

  async getStatement(cardId: string, userId: string, month?: number, year?: number) {
    await this.ensureCardBelongsToUser(cardId, userId);

    const where: { debt: { cardId: string }; dateTransaction?: { gte: Date; lte: Date } } = {
      debt: { cardId },
    };

    if (month && year) {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      where.dateTransaction = { gte: startOfMonth, lte: endOfMonth };
    }

    const installments = await this.prisma.installment.findMany({
      where,
      include: {
        debt: { select: { id: true, title: true, description: true, createdAt: true } },
      },
      orderBy: [{ dateTransaction: "desc" }, { order: "asc" }],
    });

    const total = installments.reduce((sum, i) => sum + i.value, 0);
    const totalPaid = installments.filter((i) => i.status === StatusInstallment.PAY).reduce((sum, i) => sum + i.value, 0);
    const totalPending = total - totalPaid;

    const byDebt = installments.reduce<Record<string, typeof installments>>((acc, inst) => {
      const debtId = inst.debt.id;
      if (!acc[debtId]) acc[debtId] = [];
      acc[debtId].push(inst);
      return acc;
    }, {});

    const purchases = Object.entries(byDebt).map(([debtId, insts]) => {
      const debt = insts[0].debt;
      return {
        debtId,
        title: debt.title,
        description: debt.description,
        purchaseDate: debt.createdAt,
        installments: insts.map((i) => ({
          id: i.id,
          value: i.value,
          status: i.status,
          order: i.order,
          dateTransaction: i.dateTransaction,
        })),
        total: insts.reduce((s, i) => s + i.value, 0),
      };
    });

    return {
      purchases,
      summary: {
        total,
        totalPaid,
        totalPending,
      },
      period: month && year ? { month, year } : null,
    };
  }

  async getRisk(cardId: string, userId: string) {
    const { limit, used } = await this.getLimit(cardId, userId);
    const usagePercentage = limit > 0 ? (used / limit) * 100 : 0;

    let recommendation: string;
    if (usagePercentage <= 30) {
      recommendation = "Uso saudável do limite. Mantenha assim.";
    } else if (usagePercentage <= 50) {
      recommendation = "Uso moderado. O recomendado é manter até 30% do limite.";
    } else if (usagePercentage <= 80) {
      recommendation = "Uso elevado. O recomendado é manter até 30% do limite.";
    } else {
      recommendation = "Limite muito utilizado. Evite novas compras e priorize o pagamento.";
    }

    return {
      usagePercentage: Math.round(usagePercentage * 10) / 10,
      recommendation,
    };
  }
}
