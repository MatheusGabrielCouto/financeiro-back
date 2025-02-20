import { Module } from '@nestjs/common';
import { PrismaModule } from './modules/prisma.module';
import { CreateAccountControleler } from './controllers/create-account.controller';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './env';
import { AuthModule } from './auth/auth.module';
import { AuthenticateController } from './controllers/authenticate.controller';
import { CategoryController } from './controllers/category.controller';
import { TransactionController } from './controllers/transaction.controller';
import { DebtController } from './controllers/debt.controller';
import { InstallmentController } from './controllers/installment.controller';
import { Amount } from './controllers/amount.controller';
import { FuturePurchaseController } from './controllers/future-purchase.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: env => envSchema.parse(env),
      isGlobal: true,
    }),
    AuthModule,
    PrismaModule,
  ],
  controllers: [
    CreateAccountControleler,
    AuthenticateController,
    CategoryController,
    TransactionController,
    DebtController,
    InstallmentController,
    Amount,
    FuturePurchaseController
  ],
  providers: [],
})
export class AppModule {}
