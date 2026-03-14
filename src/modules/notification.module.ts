import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma.module";
import { NotificationService } from "../services/notification.service";
import { DueItemsNotificationService } from "../services/due-items-notification.service";
import { DueItemsNotificationScheduler } from "../schedulers/due-items-notification.scheduler";
import { PantryLowStockNotificationService } from "../services/pantry-low-stock-notification.service";
import { PantryLowStockNotificationScheduler } from "../schedulers/pantry-low-stock-notification.scheduler";
import { RecurringIncomeNotificationService } from "../services/recurring-income-notification.service";
import { RecurringIncomeNotificationScheduler } from "../schedulers/recurring-income-notification.scheduler";

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [
    NotificationService,
    DueItemsNotificationService,
    DueItemsNotificationScheduler,
    PantryLowStockNotificationService,
    PantryLowStockNotificationScheduler,
    RecurringIncomeNotificationService,
    RecurringIncomeNotificationScheduler,
  ],
  exports: [NotificationService]
})
export class NotificationModule {}
