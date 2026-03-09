import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const createCategoryBodySchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  parentId: z.string().uuid().nullable().optional()
})

type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>
const createCategoryBodyPipe = new ZodValidationPipe(createCategoryBodySchema)

const updateCategoryBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  parentId: z.string().uuid().nullable().optional()
})

type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>
const updateCategoryBodyPipe = new ZodValidationPipe(updateCategoryBodySchema)

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
      include: {
        children: true
      },
      orderBy: [
        { userId: 'asc' },
        { createdAt: 'desc' }
      ]
    })

    return categories.filter(c => !c.parentId)
  }

  @Get('filter')
  @UseGuards(JwtAuthGuard)
  async filter(
    @CurrentUser() user: UserPayload,
    @Query('q') q: string
  ) {
    const term = (q ?? '').trim().toLowerCase()
    if (!term) return []

    const categories = await this.prisma.category.findMany({
      where: {
        OR: [
          { userId: null },
          { userId: user.sub }
        ]
      },
      include: {
        children: true
      }
    })

    const parents = categories.filter(c => !c.parentId)
    const children = categories.filter(c => c.parentId)

    const matchesTerm = (title: string, description: string) =>
      title.toLowerCase().includes(term) || description.toLowerCase().includes(term)

    const matchingChildrenByParent = new Map<string, typeof children>()
    const matchingParentIds = new Set<string>()

    for (const child of children) {
      if (!matchesTerm(child.title, child.description)) continue
      matchingParentIds.add(child.parentId!)
      const list = matchingChildrenByParent.get(child.parentId!) ?? []
      list.push(child)
      matchingChildrenByParent.set(child.parentId!, list)
    }

    for (const parent of parents) {
      if (matchesTerm(parent.title, parent.description)) {
        matchingParentIds.add(parent.id)
      }
    }

    return parents
      .filter(p => matchingParentIds.has(p.id))
      .map(p => ({
        ...p,
        children: matchingChildrenByParent.get(p.id) ?? []
      }))
  }

  @Post('')
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserPayload,
    @Body(createCategoryBodyPipe) body: CreateCategoryBody
  ) {
    const { description, title, icon, color, parentId } = body

    if (parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: parentId }
      })
      if (!parent) throw new NotFoundException('Categoria pai não encontrada')
      if (parent.userId && parent.userId !== user.sub) {
        throw new ForbiddenException('Você não pode adicionar sub-categoria a esta categoria')
      }
    }

    await this.prisma.category.create({
      data: {
        title,
        description: description ?? '',
        icon: icon ?? null,
        color: color ?? null,
        parentId: parentId ?? null,
        userId: user.sub
      }
    })
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body(updateCategoryBodyPipe) body: UpdateCategoryBody
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id }
    })

    if (!category) throw new NotFoundException('Categoria não encontrada')
    if (!category.userId || category.userId !== user.sub) {
      throw new ForbiddenException('Categorias do sistema não podem ser editadas')
    }

    if (body.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: body.parentId }
      })
      if (!parent) throw new NotFoundException('Categoria pai não encontrada')
      if (parent.userId && parent.userId !== user.sub) {
        throw new ForbiddenException('Você não pode mover para esta categoria')
      }
    }

    await this.prisma.category.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description ?? '' }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.parentId !== undefined && { parentId: body.parentId })
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