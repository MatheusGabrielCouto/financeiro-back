import {
  Controller,
  Post,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Body,
  NotFoundException,
  Get,
  Req,
  Param,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { CurrentUser } from 'src/auth/current-user-decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserPayload } from 'src/auth/jwt.strategy';
import { PrismaService } from 'src/prisma/prisma.service';
import { ZodValidationPipe } from 'src/pipes/zod-validation-pipe';
import { z } from 'zod';
import { Request } from 'express';
import { unlinkSync } from 'fs';

const createFuturePurchaseBodySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  value: z.coerce.number().positive('Valor deve ser positivo'),
  valueAdded: z.coerce.number().nonnegative('Valor adicionado deve ser maior ou igual a zero').optional(),
  dateAcquisition: z.coerce.string().transform((str) => new Date(str)),
});

type CreateFuturePurchaseBody = z.infer<typeof createFuturePurchaseBodySchema>;

const validationPipeCreateFuturePurchase = new ZodValidationPipe(createFuturePurchaseBodySchema);

@Controller('/future-purchase')
export class FuturePurchaseController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload, @Req() req: Request) {
    const purchases = await this.prisma.futurePurchase.findMany({
      where: { userId: user.sub },
      orderBy: { dateAcquisition: 'asc' },
    });

    // Mapeia para adicionar a URL completa da imagem
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    console.log(baseUrl)
    const purchasesWithImageUrl = purchases.map((purchase) => ({
      ...purchase,
      imageUrl: purchase.image ? `${baseUrl}${purchase.image}` : null,
    }));

    return purchasesWithImageUrl;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  async create(
    @CurrentUser() user: UserPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body(validationPipeCreateFuturePurchase) body: CreateFuturePurchaseBody,
  ) {
    const { name, value, valueAdded, dateAcquisition } = body;

    const findUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });

    if (!findUser) {
      throw new NotFoundException('Usuário não encontrado!');
    }

    const imageUrl = file ? `/uploads/${file.filename}` : '';

    const futurePurchase = await this.prisma.futurePurchase.create({
      data: {
        name,
        value: Number(value),
        valueAdded: valueAdded || 0,
        dateAcquisition: new Date(dateAcquisition),
        image: imageUrl,
        userId: user.sub,
      },
    });

    return futurePurchase;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string
  ) {
    // 1️⃣ Encontre o FuturePurchase no banco
    const futurePurchase = await this.prisma.futurePurchase.findUnique({
      where: { id },
    });

    if (!futurePurchase) {
      throw new NotFoundException('Future purchase não encontrado');
    }

    // 2️⃣ Verifique se o usuário é o proprietário da compra futura
    if (futurePurchase.userId !== user.sub) {
      throw new NotFoundException('Você não tem permissão para excluir este registro');
    }

     // 3️⃣ Deletar o arquivo da pasta de uploads
     const uploadsDir = process.env.NODE_ENV === 'production' 
     ? '/mnt/data/uploads' // Diretório persistente do Render
     : join(process.cwd()); // Para desenvolvimento local
    const filePath = join(uploadsDir, futurePurchase.image);

    try {
      unlinkSync(filePath); // Deleta o arquivo fisicamente
      console.log('Arquivo deletado:', filePath);
    } catch (err) {
      console.error('Erro ao deletar o arquivo:', err);
      throw new Error('Erro ao tentar deletar o arquivo');
    }

    // 4️⃣ Deletar o registro do banco
    await this.prisma.futurePurchase.delete({
      where: { id },
    });

    return { message: 'Compra futura e arquivo excluídos com sucesso' };
  }

}
