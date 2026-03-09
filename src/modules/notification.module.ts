import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma.module";
import { NotificationService } from "../services/notification.service";
import { DueItemsNotificationService } from "../services/due-items-notification.service";
import { DueItemsNotificationScheduler } from "../schedulers/due-items-notification.scheduler";

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [
    NotificationService,
    DueItemsNotificationService,
    DueItemsNotificationScheduler
  ],
  exports: [NotificationService]
})
export class NotificationModule {}
