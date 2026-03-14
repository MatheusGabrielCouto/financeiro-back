import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { NotificationService } from "./notification.service";

@Injectable()
export class DueItemsNotificationService {
  constructor(
    private prisma: PrismaService,
    private notification: NotificationService
  ) {}

  private readonly BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000;

  async sendDueTomorrowNotifications(): Promise<void> {
    const now = new Date();
    const nowBrazil = new Date(now.getTime() + this.BRAZIL_OFFSET_MS);
    const tomorrowBrazil = new Date(nowBrazil);
    tomorrowBrazil.setUTCDate(tomorrowBrazil.getUTCDate() + 1);

    const tomorrowDay = tomorrowBrazil.getUTCDate();
    const tomorrowMonth = tomorrowBrazil.getUTCMonth();
    const tomorrowYear = tomorrowBrazil.getUTCFullYear();

    const startOfTomorrow = new Date(
      Date.UTC(tomorrowYear, tomorrowMonth, tomorrowDay, 0, 0, 0, 0)
    );
    const endOfTomorrow = new Date(
      Date.UTC(tomorrowYear, tomorrowMonth, tomorrowDay, 23, 59, 59, 999)
    );

    const startOfTomorrowMonth = new Date(
      Date.UTC(tomorrowYear, tomorrowMonth, 1, 0, 0, 0, 0)
    );

    const [recurringPaymentsDue, installmentsDue] = await Promise.all([
      this.prisma.recurringPayment.findMany({
        where: {
          dayOfMonth: tomorrowDay,
          OR: [
            { lastProcessedAt: null },
            {
              lastProcessedAt: {
                lt: startOfTomorrowMonth
              }
            }
          ]
        },
        include: { user: true }
      }),
      this.prisma.installment.findMany({
        where: {
          status: "SCHEDULE",
          dateTransaction: { gte: startOfTomorrow, lte: endOfTomorrow }
        },
        include: { debt: { include: { user: true } } }
      })
    ]);

    const userAlerts = new Map<
      string,
      { recurring: string[]; installments: string[] }
    >();

    for (const rp of recurringPaymentsDue) {
      const alerts = userAlerts.get(rp.userId) ?? {
        recurring: [],
        installments: []
      };
      alerts.recurring.push(`${rp.title}: R$ ${rp.value.toFixed(2)}`);
      userAlerts.set(rp.userId, alerts);
    }

    for (const inst of installmentsDue) {
      const userId = inst.debt.userId;
      const alerts = userAlerts.get(userId) ?? {
        recurring: [],
        installments: []
      };
      alerts.installments.push(
        `${inst.debt.title}: R$ ${inst.value.toFixed(2)}`
      );
      userAlerts.set(userId, alerts);
    }

    for (const [userId, alerts] of userAlerts) {
      const tokens = await this.prisma.pushToken.findMany({
        where: { userId },
        select: { token: true }
      });

      if (tokens.length === 0) continue;

      const messages: string[] = [];
      if (alerts.recurring.length > 0) {
        messages.push(
          `Pagamentos recorrentes: ${alerts.recurring.join(", ")}`
        );
      }
      if (alerts.installments.length > 0) {
        messages.push(`Parcelas: ${alerts.installments.join(", ")}`);
      }

      const title = "Contas vencendo amanhã";
      const body = messages.join("\n");

      await this.notification.sendToMany(
        tokens.map((t) => t.token),
        title,
        body,
        {
          type: "due_tomorrow",
          screen: "Debts",
          params: {},
        }
      );
    }
  }
}
