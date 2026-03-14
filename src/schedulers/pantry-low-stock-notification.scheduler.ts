import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PantryLowStockNotificationService } from '../services/pantry-low-stock-notification.service';

@Injectable()
export class PantryLowStockNotificationScheduler {
  constructor(
    private pantryLowStockNotification: PantryLowStockNotificationService,
  ) {}

  @Cron('0 8 * * *')
  async handleLowStockNotifications() {
    await this.pantryLowStockNotification.sendLowStockNotifications();
  }
}
