import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { CurrentUser } from 'src/auth/current-user-decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserPayload } from 'src/auth/jwt.strategy';
import { PrismaService } from 'src/prisma/prisma.service';
import { ZodValidationPipe } from 'src/pipes/zod-validation-pipe';
import { z } from 'zod';

const createListBodySchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
});

const createItemBodySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  quantity: z.coerce.number().int().positive().default(1),
});

const updateItemBodySchema = z.object({
  name: z.string().min(1).optional(),
  quantity: z.coerce.number().int().positive().optional(),
});

type CreateListBody = z.infer<typeof createListBodySchema>;
type CreateItemBody = z.infer<typeof createItemBodySchema>;
type UpdateItemBody = z.infer<typeof updateItemBodySchema>;

const createListPipe = new ZodValidationPipe(createListBodySchema);
const createItemPipe = new ZodValidationPipe(createItemBodySchema);
const updateItemPipe = new ZodValidationPipe(updateItemBodySchema);

@Controller('/grocery-list')
export class GroceryListController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserPayload,
    @Body(createListPipe) body: CreateListBody,
  ) {
    return this.prisma.groceryList.create({
      data: {
        title: body.title,
        userId: user.sub,
      },
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload) {
    return this.prisma.groceryList.findMany({
      where: { userId: user.sub },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch('item/:id')
  @UseGuards(JwtAuthGuard)
  async updateItem(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body(updateItemPipe) body: UpdateItemBody,
  ) {
    const item = await this.prisma.groceryListItem.findFirst({
      where: { id },
      include: { list: true },
    });
    if (!item || item.list.userId !== user.sub) {
      throw new NotFoundException('Item não encontrado');
    }
    return this.prisma.groceryListItem.update({
      where: { id },
      data: body,
    });
  }

  @Delete('item/:id')
  @UseGuards(JwtAuthGuard)
  async deleteItem(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    const item = await this.prisma.groceryListItem.findFirst({
      where: { id },
      include: { list: true },
    });
    if (!item || item.list.userId !== user.sub) {
      throw new NotFoundException('Item não encontrado');
    }
    await this.prisma.groceryListItem.delete({ where: { id } });
    return { message: 'Item excluído com sucesso' };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async find(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    const list = await this.prisma.groceryList.findFirst({
      where: { id, userId: user.sub },
      include: { items: true },
    });
    if (!list) throw new NotFoundException('Lista não encontrada');
    return list;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    const list = await this.prisma.groceryList.findFirst({
      where: { id, userId: user.sub },
    });
    if (!list) throw new NotFoundException('Lista não encontrada');
    await this.prisma.groceryList.delete({ where: { id } });
    return { message: 'Lista excluída com sucesso' };
  }

  @Post(':id/item')
  @UseGuards(JwtAuthGuard)
  async addItem(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body(createItemPipe) body: CreateItemBody,
  ) {
    const list = await this.prisma.groceryList.findFirst({
      where: { id, userId: user.sub },
    });
    if (!list) throw new NotFoundException('Lista não encontrada');
    return this.prisma.groceryListItem.create({
      data: {
        listId: id,
        name: body.name,
        quantity: body.quantity,
      },
    });
  }
}
