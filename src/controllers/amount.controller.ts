import { Controller, Get, NotFoundException, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";
import { roundMoney } from "src/utils/money";

@Controller("/amount")
export class Amount {
  constructor(private prisma: PrismaService) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload) {
    const userFiltered = await this.prisma.user.findUnique({
      where: { id: user.sub }
    });

    if (!userFiltered) {
      throw new NotFoundException("Usuário não encontrado!");
    }

    return {
      amount: roundMoney(userFiltered.amount)
    };
  }
} 