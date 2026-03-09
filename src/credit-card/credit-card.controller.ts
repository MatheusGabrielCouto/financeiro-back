import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { z } from "zod";
import { CreditCardService } from "./credit-card.service";

const createCreditCardSchema = z.object({
  name: z.string(),
  brand: z.string().nullable().optional(),
  limit: z.number().positive(),
  closingDay: z.number().min(1).max(31),
  dueDay: z.number().min(1).max(31),
  lastDigits: z.string().nullable().optional(),
});

const createPurchaseSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  value: z.number().positive(),
  installmentsCount: z.number().min(1),
});

const payInvoiceSchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2100),
});

type CreateCreditCardBody = z.infer<typeof createCreditCardSchema>;
type CreatePurchaseBody = z.infer<typeof createPurchaseSchema>;
type PayInvoiceBody = z.infer<typeof payInvoiceSchema>;

@Controller("credit-card")
@UseGuards(JwtAuthGuard)
export class CreditCardController {
  constructor(private creditCardService: CreditCardService) {}

  @Get()
  async list(@CurrentUser() user: UserPayload) {
    return this.creditCardService.list(user.sub);
  }

  @Post()
  async create(
    @CurrentUser() user: UserPayload,
    @Body(new ZodValidationPipe(createCreditCardSchema)) body: CreateCreditCardBody
  ) {
    return this.creditCardService.create(user.sub, {
      name: body.name,
      brand: body.brand ?? null,
      limit: body.limit,
      closingDay: body.closingDay,
      dueDay: body.dueDay,
      lastDigits: body.lastDigits ?? null,
    });
  }

  @Delete(":id")
  async delete(@CurrentUser() user: UserPayload, @Param("id") id: string) {
    return this.creditCardService.delete(id, user.sub);
  }

  @Get(":id/invoice")
  async getInvoice(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string,
    @Query("month") month: string,
    @Query("year") year: string
  ) {
    const monthNum = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    const yearNum = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.creditCardService.getInvoice(id, user.sub, monthNum, yearNum);
  }

  @Get(":id/limit")
  async getLimit(@CurrentUser() user: UserPayload, @Param("id") id: string) {
    return this.creditCardService.getLimit(id, user.sub);
  }

  @Get(":id/statement")
  async getStatement(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string,
    @Query("month") month: string,
    @Query("year") year: string
  ) {
    const monthNum = month ? parseInt(month, 10) : undefined;
    const yearNum = year ? parseInt(year, 10) : undefined;
    return this.creditCardService.getStatement(id, user.sub, monthNum, yearNum);
  }

  @Get(":id/risk")
  async getRisk(@CurrentUser() user: UserPayload, @Param("id") id: string) {
    return this.creditCardService.getRisk(id, user.sub);
  }

  @Post(":id/purchase")
  async createPurchase(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createPurchaseSchema)) body: CreatePurchaseBody
  ) {
    return this.creditCardService.createPurchase(id, user.sub, {
      title: body.title,
      description: body.description ?? null,
      value: body.value,
      installmentsCount: body.installmentsCount,
    });
  }

  @Post(":id/pay-invoice")
  async payInvoice(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(payInvoiceSchema)) body: PayInvoiceBody
  ) {
    return this.creditCardService.payInvoice(id, user.sub, body.month, body.year);
  }
}
