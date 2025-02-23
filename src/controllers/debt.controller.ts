import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
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