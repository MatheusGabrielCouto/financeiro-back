import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Expo from "expo-server-sdk";

@Injectable()
export class NotificationService {
  private expo: Expo;

  constructor(private config: ConfigService) {
    const accessToken = this.config.get<string>("EXPO_ACCESS_TOKEN")?.trim();
    this.expo = new Expo(
      accessToken && accessToken.length > 0 ? { accessToken } : undefined
    );
  }

  async sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<boolean> {
    if (!Expo.isExpoPushToken(token)) {
      return false;
    }

    try {
      const chunks = this.expo.chunkPushNotifications([
        {
          to: token,
          title,
          body,
          data: data ?? {},
          sound: "default"
        }
      ]);

      for (const chunk of chunks) {
        await this.expo.sendPushNotificationsAsync(chunk);
      }
      return true;
    } catch {
      return false;
    }
  }

  async sendToMany(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
    if (validTokens.length === 0) return;

    const messages = validTokens.map((to) => ({
      to,
      title,
      body,
      data: data ?? {},
      sound: "default" as const
    }));

    const chunks = this.expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        await this.expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error("Erro ao enviar push notification:", err);
      }
    }
  }
}
