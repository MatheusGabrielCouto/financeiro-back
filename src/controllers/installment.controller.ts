import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const createInstallmentBodySchema = z.object({
  debtId: z.string().uuid(),
  value: z.number(),
  date: z.string().transform((str) => new Date(str))
})

type CreateInstallmentBody = z.infer<typeof createInstallmentBodySchema>
const createInstallmentValidation = new ZodValidationPipe(createInstallmentBodySchema)

@Controller('/installment')
export class InstallmentController {
  constructor( private prisma: PrismaService ) {}


  @Get('/')
  @UseGuards(JwtAuthGuard)
  async getInstallments(
    @CurrentUser() user: UserPayload,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const monthNumber = parseInt(month, 10);
    const yearNumber = parseInt(year, 10);

    if (isNaN(monthNumber) || isNaN(yearNumber)) {
      throw new Error('Mês e ano devem ser números válidos');
    }

    const installments = await this.prisma.installment.findMany({
      where: {
        debt: {
          userId: user.sub,
        },
        dateTransaction: {
          gte: new Date(yearNumber, monthNumber - 1, 1),
          lt: new Date(yearNumber, monthNumber, 1),
        },
      },
      include: {
        debt: {
          include: {
            installments: true
          }
        },
      },
    });

    // Obtem todas as `debtId` únicas para buscar a quantidade de parcelas de cada uma
    const debtIds = [...new Set(installments.map((i) => i.debtId))];

    const debtsWithInstallmentCount = await this.prisma.debt.findMany({
      where: {
        id: { in: debtIds },
      },
      select: {
        id: true,
        _count: {
          select: { installments: true },
        },
      },
    });

    const installmentCountMap = debtsWithInstallmentCount.reduce((acc, debt) => {
      acc[debt.id] = debt._count.installments;
      return acc;
    }, {} as Record<string, number>);

    const result = installments.map((installment) => ({
      ...installment,
      totalInstallments: installmentCountMap[installment.debtId] || 0,
      debt: {
        title: installment.debt.title,
        description: installment.debt.description,
        createdAt: installment.debt.createdAt,
      },
    }));

    return result;
  }

  @Patch('/:id')
  @UseGuards(JwtAuthGuard)
  async payIntallment(
    @Param() {id}: {id: string},
    @CurrentUser() user: UserPayload
  ) {
    const installment = await this.prisma.installment.findUnique({
      where: {
        id
      }
    })

    if(installment?.status === 'PAY') {
      throw new NotFoundException('Erro ao efetuar o pagamento')
    }

    const debt = await this.prisma.debt.findUnique({
      where: {
        id: installment?.debtId
      }
    })

    if(debt?.userId !== user.sub) {
      throw new UnauthorizedException('Error')
    }

    const findUser = await this.prisma.user.findUnique({
      where: {
         id: user.sub
      }
    })

    if (!findUser) {
      throw new NotFoundException('Usuário não encontrado!')
    }

    if(!installment) {
      throw new NotFoundException('Parcela não encontrada!')
    }

    if (findUser.amount - installment.value < 0) {
      throw new NotFoundException('Saldo em conta insuficiente')
    }

    await this.prisma.transaction.create({
      data: {
        message: debt.description,
        type: 'PAY',
        value: installment?.value,
        userId: user.sub
      }
    })

    await this.prisma.installment.update({
      where: {id},
      data: {
        status: 'PAY'
      }
    })

    await this.prisma.user.update({
      where: {
        id: user.sub
      },
      data: {
        amount: findUser.amount - installment.value
      }
    });
  }

  @Post('')
  @UseGuards(JwtAuthGuard)
  async createInstallment(
    @Body(createInstallmentValidation) body: CreateInstallmentBody,
    @CurrentUser() user: UserPayload
  ) {
    const { debtId, value, date } = body

    const debt = await this.prisma.debt.findUnique({ where: { id: debtId },
      include: {
        installments: true
      }
    })

    if(!debt?.installments) {
      throw new NotFoundException('Erro ao criar parcela.')
    }

    await this.prisma.installment.create({
      data: {
        debtId,
        order: debt?.installments.length + 1,
        status: 'SCHEDULE',
        value,
        dateTransaction: new Date(date)
      }
    })
  }

  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  async deleteInstallment(@Param('id') id: string) {
    // Verifica se a parcela existe
    const installment = await this.prisma.installment.findUnique({ where: { id } });
    if (!installment) {
      throw new NotFoundException('Installment not found');
    }

    // Obtém a dívida associada e suas parcelas
    const debt = await this.prisma.debt.findUnique({
      where: { id: installment.debtId },
      include: { installments: true },
    });

    if (!debt) {
      throw new NotFoundException('Debt not found');
    }

    // Remove a parcela primeiro
    await this.prisma.installment.delete({ where: { id } });

    // Atualiza a ordem das parcelas restantes
    const installmentsToUpdate = debt.installments
      .filter(inst => inst.id !== id) // Remove a parcela deletada
      .sort((a, b) => a.order - b.order) // Garante que está ordenado corretamente
      .map((inst, index) => ({
        where: { id: inst.id },
        data: { order: index + 1 }, // Atualiza a ordem corretamente
      }));

    // Aplica os updates individualmente
    for (const update of installmentsToUpdate) {
      await this.prisma.installment.update(update);
    }
  }

}