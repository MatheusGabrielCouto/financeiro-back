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
import { CloudinaryService } from 'src/services/cloudinary.service';

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
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload, @Req() req: Request) {
    const purchases = await this.prisma.futurePurchase.findMany({
      where: { userId: user.sub },
      orderBy: { dateAcquisition: 'asc' },
    });

    return purchases;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @CurrentUser() user: UserPayload,
    @Body(validationPipeCreateFuturePurchase) body: CreateFuturePurchaseBody,
    @UploadedFile() image: Express.Multer.File,
  ) {
    const { name, value, dateAcquisition } = body;

    let imageUrl: string = '';
    if (image) {
      imageUrl = await this.cloudinaryService.uploadImage(image);
    }

    await this.prisma.futurePurchase.create({
      data: {
        name,
        value: Number(value),
        dateAcquisition: new Date(dateAcquisition),
        image: imageUrl,
        userId: user.sub,
        valueAdded: 0,
      },
    });

  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id') id: string) {
    const futurePurchase = await this.prisma.futurePurchase.findUnique({ where: { id } });

    if (!futurePurchase) {
      throw new Error('Future Purchase not found');
    }

    // Deleta imagem do Cloudinary (extrai publicId da URL)
    if (futurePurchase.image) {
      const publicId = this.extractPublicId(futurePurchase.image);
      
      await this.cloudinaryService.deleteImage(publicId);
    }

    await this.prisma.futurePurchase.delete({ where: { id } });

    return { message: 'Future purchase deleted successfully' };
  }

  private extractPublicId(url: string): string {
    const parts = url.split('/');
    const filenameWithExtension = parts[parts.length - 1];
    const [filename] = filenameWithExtension.split('.');
    return `future-purchases/${filename}`; // Mesma pasta usada no upload
  }

}
