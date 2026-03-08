import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { StatusInstallment } from "@prisma/client";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const createDebtBodySchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  installments: z.array(z.object({
    value: z.number(),
    status: z.enum(['PAY', 'SCHEDULE']),
    date: z.string().transform((str) => new Date(str))
  }))
})

const createDebtBodyRecurrenceSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  value: z.number(), // Valor total do débito
  installmentsCount: z.number().min(1), // Número de parcelas
  recurrence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']), // Tipo de recorrência
  dayOfMonth: z.string()
});

type CreateDebtRecurrenceBody = z.infer<typeof createDebtBodyRecurrenceSchema>;
const createDebtRecurrenceBodyPipe = new ZodValidationPipe(createDebtBodyRecurrenceSchema);

type CreateDebtBody = z.infer<typeof createDebtBodySchema>
const createDebtBodyPipe = new ZodValidationPipe(createDebtBodySchema)

@Controller('/debt')
export class DebtController {
constructor(
    private prisma: PrismaService
  ){}

  @Get('')
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: UserPayload
  ) {
    const debts = this.prisma.debt.findMany({
      where: {
        userId: user.sub
      },
      include: {
        installments: {
          orderBy: {
            order: "asc"
          }
        }
      }
    })

    return debts
  }

  @Get('/:id')
  @UseGuards(JwtAuthGuard)
  async find(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string
  ) {
    
    const debts = this.prisma.debt.findUnique({
      where: {
        id        
      },
      include: {
        installments: {
          orderBy: {
            order: "asc"
          }
        }
      }
    })

    return debts
  }

@Post('/recurrence')
@UseGuards(JwtAuthGuard)
async createRecurrence(
  @CurrentUser() user: UserPayload,
  @Body(createDebtRecurrenceBodyPipe) body: CreateDebtRecurrenceBody
) {
  const { title, description, value, installmentsCount, recurrence, dayOfMonth } = body;

  const now = new Date();
  const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const startDate = now < firstDayOfNextMonth
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : firstDayOfNextMonth;

  // Criando as parcelas automaticamente
  const installments = Array.from({ length: installmentsCount }, (_, i) => {
    const date = new Date(startDate); // Data inicial do próximo mês
    date.setMonth(date.getMonth() + i); // Adiciona o número correto de meses
    date.setDate(Number(dayOfMonth)); // Define o dia fixo do mês

    // Se o dia do mês for maior que o número de dias no mês, ajusta para o último dia
    if (date.getDate() !== Number(dayOfMonth)) {
      date.setMonth(date.getMonth() + 1);
      date.setDate(0); // Último dia do mês
    }

    return {
      value: value,
      status: StatusInstallment.SCHEDULE, // Enum correto
      order: i + 1,
      dateTransaction: date, // Data ajustada
    };
  });

  await this.prisma.debt.create({
    data: {
      title,
      description: description || '',
      userId: user.sub,
      recurrence,
      installments: {
        create: installments,
      },
    },
  });
}

  @Post('')
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserPayload,
    @Body(createDebtBodyPipe) body: CreateDebtBody
  ) {
    const { description, title, installments } = body

    await this.prisma.debt.create({
      data: {
        title,
        description: description || '',
        userId: user.sub,
        installments: {
          create: installments.map((instalment, index) => ({
            value: instalment.value,
            status: instalment.status,
            order: index + 1,
            dateTransaction: new Date(instalment.date)
          }))
        }
      }
    })
  }

  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  async deleteDebt(
    @Param() {id}: {id: string}
  ) {
    await this.prisma.debt.delete({
      where: {id},
      include: {
        installments: true
      }
    })
  }
}