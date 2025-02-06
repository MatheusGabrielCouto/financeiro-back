import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const createInstallmentBodySchema = z.object({
  debtId: z.string().uuid(),
  value: z.number(),
})

type CreateInstallmentBody = z.infer<typeof createInstallmentBodySchema>
const createInstallmentValidation = new ZodValidationPipe(createInstallmentBodySchema)

@Controller('/installment')
export class InstallmentController {
  constructor( private prisma: PrismaService ) {}

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

    await this.prisma.installment.update({
      where: {id},
      data: {
        status: 'PAY'
      }
    })
  }

  @Post('')
  @UseGuards(JwtAuthGuard)
  async createInstallment(
    @Body(createInstallmentValidation) body: CreateInstallmentBody,
    @CurrentUser() user: UserPayload
  ) {
    const { debtId, value } = body

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
        value
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