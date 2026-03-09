import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const createCategoryBodySchema = z.object({
  title: z.string(),
  description: z.string().nullable()
})

type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>
const createCategoryBodyPipe = new ZodValidationPipe(createCategoryBodySchema)

@Controller('/category')
export class CategoryController {
  constructor(
    private prisma: PrismaService
  ){}

  @Get('')
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: UserPayload
  ) {
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [
          { userId: null },
          { userId: user.sub }
        ]
      },
      omit: {
        userId: true
      },
      orderBy: [
        { userId: 'asc' },
        { createdAt: 'desc' }
      ]
    })

    return categories
  }

  @Post('')
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserPayload,
    @Body(createCategoryBodyPipe) body: CreateCategoryBody
  ) {
    const { description, title } = body

    await this.prisma.category.create({
      data: {
        title,
        description: description || '',
        userId: user.sub
      }
    })
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id }
    })

    if (!category) {
      throw new NotFoundException('Categoria não encontrada')
    }

    if (!category.userId || category.userId !== user.sub) {
      throw new ForbiddenException('Categorias do sistema não podem ser deletadas')
    }

    await this.prisma.category.delete({
      where: { id }
    })
  }
}