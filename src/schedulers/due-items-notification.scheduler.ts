import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DueItemsNotificationService } from "../services/due-items-notification.service";

@Injectable()
export class DueItemsNotificationScheduler {
  constructor(
    private dueItemsNotification: DueItemsNotificationService
  ) {}

  @Cron("0 8 * * *") // TODO: voltar para "0 8 * * *" após testar
  async handleDueTomorrowNotifications() {
    await this.dueItemsNotification.sendDueTomorrowNotifications();
  }
}
