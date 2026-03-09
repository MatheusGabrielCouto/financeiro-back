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
import { RecurringIncomeController } from './controllers/recurring-income.controller';
import { DetailsController } from './controllers/details.controller';
import { BudgetController } from './controllers/budget.controller';
import { SpendingInsightsController } from './controllers/spending-insights.controller';
import { RecurringPaymentController } from './controllers/recurring-payment.controller';
import { PushTokenController } from './controllers/push-token.controller';
import { NotificationModule } from './modules/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: env => envSchema.parse(env),
      isGlobal: true,
    }),
    AuthModule,
    PrismaModule,
    NotificationModule,
  ],
  controllers: [
    CreateAccountControleler,
    AuthenticateController,
    CategoryController,
    TransactionController,
    DebtController,
    InstallmentController,
    Amount,
    FuturePurchaseController,
    RecurringIncomeController,
    RecurringPaymentController,
    DetailsController,
    BudgetController,
    SpendingInsightsController,
    PushTokenController
  ],
  providers: [],
})
export class AppModule {}
