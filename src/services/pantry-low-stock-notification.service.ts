import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class PantryLowStockNotificationService {
  constructor(
    private prisma: PrismaService,
    private notification: NotificationService,
  ) {}

  async sendLowStockNotifications(): Promise<void> {
    const lowStockItems = await this.prisma.pantryItem.findMany({
      where: { quantity: { lte: 1 } },
      select: { userId: true, name: true, quantity: true },
    });

    const byUser = new Map<
      string,
      { acabando: string[]; esgotado: string[] }
    >();

    for (const item of lowStockItems) {
      if (!byUser.has(item.userId)) {
        byUser.set(item.userId, { acabando: [], esgotado: [] });
      }
      const userItems = byUser.get(item.userId)!;
      if (item.quantity === 0) {
        userItems.esgotado.push(item.name);
      } else {
        userItems.acabando.push(item.name);
      }
    }

    for (const [userId, items] of byUser) {
      const hasAcabando = items.acabando.length > 0;
      const hasEsgotado = items.esgotado.length > 0;
      if (!hasAcabando && !hasEsgotado) continue;

      const tokens = await this.prisma.pushToken.findMany({
        where: { userId },
        select: { token: true },
      });
      if (tokens.length === 0) continue;

      const messages: string[] = [];
      if (hasAcabando) {
        const count = items.acabando.length;
        const text =
          count === 1
            ? `1 item do estoque está acabando: ${items.acabando[0]}`
            : `${count} itens do estoque estão acabando: ${items.acabando.join(', ')}`;
        messages.push(text);
      }
      if (hasEsgotado) {
        const count = items.esgotado.length;
        const text =
          count === 1
            ? `1 item do estoque está esgotado: ${items.esgotado[0]}`
            : `${count} itens do estoque estão esgotados: ${items.esgotado.join(', ')}`;
        messages.push(text);
      }

      const title = 'Alerta do estoque';
      const body = messages.join('. ');

      await this.notification.sendToMany(
        tokens.map((t) => t.token),
        title,
        body,
        {
          type: 'pantry_low_stock',
          screen: 'Pantry',
          params: {},
        },
      );
    }
  }
}
