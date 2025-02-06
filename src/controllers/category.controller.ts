import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
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
    const categories = this.prisma.category.findMany({
      where: {
        userId: user.sub
      },
      omit: {
        userId: true
      }
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
}