import { Body, Controller, Delete, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { z } from "zod";

const registerTokenBodySchema = z.object({
  token: z.string().min(1)
});

type RegisterTokenBody = z.infer<typeof registerTokenBodySchema>;
const registerTokenBodyPipe = new ZodValidationPipe(registerTokenBodySchema);

@Controller("/push-token")
export class PushTokenController {
  constructor(private prisma: PrismaService) {}

  @Post("")
  @UseGuards(JwtAuthGuard)
  async register(
    @CurrentUser() user: UserPayload,
    @Body(registerTokenBodyPipe) body: RegisterTokenBody
  ) {
    const { token } = body;

    await this.prisma.$transaction(async (tx) => {
      await tx.pushToken.deleteMany({ where: { token } });
      await tx.pushToken.upsert({
        where: { userId: user.sub },
        create: { token, userId: user.sub },
        update: { token }
      });
    });

    return { success: true };
  }

  @Delete("")
  @UseGuards(JwtAuthGuard)
  async remove(
    @CurrentUser() user: UserPayload,
    @Body(registerTokenBodyPipe) body: RegisterTokenBody
  ) {
    const { token } = body;

    await this.prisma.pushToken.deleteMany({
      where: { token, userId: user.sub }
    });

    return { success: true };
  }
}
