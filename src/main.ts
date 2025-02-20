import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Env } from './env';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });

  // Agora, estamos acessando a pasta uploads de forma correta
  const uploadsPath = join(__dirname, '..', '..', 'uploads'); // Caminho absoluto da raiz
  console.log('Servindo uploads em:', uploadsPath);

  app.useStaticAssets(uploadsPath, {
    prefix: '/uploads',
  });

  const configService: ConfigService<Env, true> = app.get(ConfigService);
  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}
bootstrap();
