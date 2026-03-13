import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ReserveCalculationService } from "src/services/reserve-calculation.service";

const DEFAULT_MONTHS_TARGET = 6;

@Controller("/emergency-reserve")
export class EmergencyReserveController {
  constructor(
    private reserveCalculation: ReserveCalculationService
  ) {}

  @Get("")
  @UseGuards(JwtAuthGuard)
  async getReserve(
    @CurrentUser() user: UserPayload,
    @Query("months") monthsParam?: string
  ) {
    const monthsTarget = monthsParam
      ? Math.min(12, Math.max(3, parseInt(monthsParam, 10)))
      : DEFAULT_MONTHS_TARGET;

    const {
      currentReserve,
      monthlyNeed: fallbackMonthlyNeed,
      monthsOfReserve: monthsCovered
    } = await this.reserveCalculation.calculate(user.sub);

    const recommendedReserve =
      fallbackMonthlyNeed > 0 ? fallbackMonthlyNeed * monthsTarget : 0;
    const progressPercent =
      recommendedReserve > 0
        ? Math.min(100, (currentReserve / recommendedReserve) * 100)
        : 0;

    const message =
      recommendedReserve > 0
        ? `Você deveria ter R$ ${recommendedReserve.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })} de reserva. Baseado em gastos mensais de R$ ${fallbackMonthlyNeed.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}.`
        : "Cadastre suas entradas recorrentes ou transações para calcular a reserva recomendada.";

    return {
      recommendedReserve: Math.round(recommendedReserve * 100) / 100,
      currentReserve: Math.round(currentReserve * 100) / 100,
      monthlyExpenses: Math.round(fallbackMonthlyNeed * 100) / 100,
      monthsTarget,
      monthsCovered: Math.round(monthsCovered * 10) / 10,
      progressPercent: Math.round(progressPercent * 100) / 100,
      message,
      missing: Math.round(Math.max(0, recommendedReserve - currentReserve) * 100) / 100
    };
  }
}
