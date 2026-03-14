import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RecurringIncomeNotificationService } from '../services/recurring-income-notification.service';

@Injectable()
export class RecurringIncomeNotificationScheduler {
  constructor(
    private recurringIncomeNotification: RecurringIncomeNotificationService,
  ) {}

  @Cron('0 8 * * *')
  async handleRecurringIncome() {
    await this.recurringIncomeNotification.processAndNotify();
  }
}
