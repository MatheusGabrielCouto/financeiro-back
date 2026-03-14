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
import { FinancialScoreController } from './controllers/financial-score.controller';
import { ReportsController } from './controllers/reports.controller';
import { InstallmentSimulationController } from './controllers/installment-simulation.controller';
import { EmergencyReserveController } from './controllers/emergency-reserve.controller';
import { GroceryController } from './controllers/grocery.controller';
import { GroceryListController } from './controllers/grocery-list.controller';
import { GroceryPurchaseController } from './controllers/grocery-purchase.controller';
import { PantryController } from './controllers/pantry.controller';
import { NotificationModule } from './modules/notification.module';
import { CreditCardModule } from './credit-card/credit-card.module';
import { JointAccountModule } from './joint-account/joint-account.module';
import { ReserveCalculationService } from './services/reserve-calculation.service';
import { GroceryService } from './services/grocery.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: env => envSchema.parse(env),
      isGlobal: true,
    }),
    AuthModule,
    PrismaModule,
    NotificationModule,
    CreditCardModule,
    JointAccountModule,
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
    PushTokenController,
    FinancialScoreController,
    ReportsController,
    InstallmentSimulationController,
    EmergencyReserveController,
    GroceryController,
    GroceryListController,
    GroceryPurchaseController,
    PantryController,
  ],
  providers: [ReserveCalculationService, GroceryService],
})
export class AppModule {}
