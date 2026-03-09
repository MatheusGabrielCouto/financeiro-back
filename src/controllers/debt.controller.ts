import { Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { RecurrenceType, StatusInstallment } from "@prisma/client";
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
  value: z.number(),
  installmentsCount: z.number().min(1),
  recurrence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  dayOfMonth: z.string().optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  month: z.number().min(1).max(12).optional(),
}).superRefine((data, ctx) => {
  if (data.recurrence === 'MONTHLY' && !data.dayOfMonth) {
    ctx.addIssue({ code: 'custom', message: 'dayOfMonth é obrigatório para recorrência mensal', path: ['dayOfMonth'] });
  }
  if (data.recurrence === 'WEEKLY' && data.dayOfWeek === undefined) {
    ctx.addIssue({ code: 'custom', message: 'dayOfWeek é obrigatório para recorrência semanal (0=Dom, 6=Sab)', path: ['dayOfWeek'] });
  }
  if (data.recurrence === 'YEARLY' && (!data.dayOfMonth || !data.month)) {
    if (!data.dayOfMonth) ctx.addIssue({ code: 'custom', message: 'dayOfMonth é obrigatório para recorrência anual', path: ['dayOfMonth'] });
    if (!data.month) ctx.addIssue({ code: 'custom', message: 'month é obrigatório para recorrência anual (1-12)', path: ['month'] });
  }
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
        userId: user.sub,
        cardId: null,
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
    return this.prisma.debt.findFirst({
      where: {
        id,
        userId: user.sub,
        cardId: null,
      },
      include: {
        installments: {
          orderBy: {
            order: "asc"
          }
        }
      }
    });
  }

@Post('/recurrence')
@UseGuards(JwtAuthGuard)
async createRecurrence(
  @CurrentUser() user: UserPayload,
  @Body(createDebtRecurrenceBodyPipe) body: CreateDebtRecurrenceBody
) {
  const { title, description, value, installmentsCount, recurrence, dayOfMonth, dayOfWeek, month } = body;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const getNextDate = (): Date => {
    switch (recurrence) {
      case 'DAILY': {
        return new Date(now);
      }
      case 'WEEKLY': {
        const target = new Date(now);
        const currentDay = target.getDay();
        let daysUntil = (dayOfWeek! - currentDay + 7) % 7;
        if (daysUntil === 0) daysUntil = 7;
        target.setDate(target.getDate() + daysUntil);
        return target;
      }
      case 'MONTHLY': {
        let date = new Date(now.getFullYear(), now.getMonth(), Number(dayOfMonth!));
        if (date.getDate() !== Number(dayOfMonth!)) {
          date = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }
        if (date <= now) {
          date = new Date(now.getFullYear(), now.getMonth() + 1, Number(dayOfMonth!));
          if (date.getDate() !== Number(dayOfMonth!)) {
            date = new Date(now.getFullYear(), now.getMonth() + 2, 0);
          }
        }
        return date;
      }
      case 'YEARLY': {
        let date = new Date(now.getFullYear(), month! - 1, Number(dayOfMonth!));
        if (date.getDate() !== Number(dayOfMonth!)) {
          date = new Date(now.getFullYear(), month!, 0);
        }
        if (date <= now) {
          date = new Date(now.getFullYear() + 1, month! - 1, Number(dayOfMonth!));
          if (date.getDate() !== Number(dayOfMonth!)) {
            date = new Date(now.getFullYear() + 1, month!, 0);
          }
        }
        return date;
      }
    }
  };

  const startDate = getNextDate();

  const installments = Array.from({ length: installmentsCount }, (_, i) => {
    const date = new Date(startDate);

    switch (recurrence) {
      case 'DAILY':
        date.setDate(date.getDate() + i);
        break;
      case 'WEEKLY':
        date.setDate(date.getDate() + i * 7);
        break;
      case 'MONTHLY':
        date.setMonth(date.getMonth() + i);
        date.setDate(Number(dayOfMonth!));
        if (date.getDate() !== Number(dayOfMonth!)) {
          date.setMonth(date.getMonth() + 1);
          date.setDate(0);
        }
        break;
      case 'YEARLY':
        date.setFullYear(date.getFullYear() + i);
        date.setMonth(month! - 1);
        date.setDate(Number(dayOfMonth!));
        if (date.getDate() !== Number(dayOfMonth!)) {
          date.setMonth(month!);
          date.setDate(0);
        }
        break;
    }

    return {
      value,
      status: StatusInstallment.SCHEDULE,
      order: i + 1,
      dateTransaction: date,
    };
  });

  await this.prisma.debt.create({
    data: {
      title,
      description: description || '',
      userId: user.sub,
      recurrence: recurrence as RecurrenceType,
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
    @CurrentUser() user: UserPayload,
    @Param() {id}: {id: string}
  ) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, userId: user.sub, cardId: null },
    });
    if (!debt) throw new NotFoundException("Dívida não encontrada");
    await this.prisma.debt.delete({
      where: { id },
      include: { installments: true },
    });
  }
}