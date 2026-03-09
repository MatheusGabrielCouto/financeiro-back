import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { z } from "zod";
import { JointAccountService } from "./joint-account.service";

const createJointAccountSchema = z.object({
  name: z.string().min(1),
});

const inviteSchema = z.object({
  email: z.string().email(),
});

type CreateJointAccountBody = z.infer<typeof createJointAccountSchema>;
type InviteBody = z.infer<typeof inviteSchema>;

@Controller("joint-account")
@UseGuards(JwtAuthGuard)
export class JointAccountController {
  constructor(private jointAccountService: JointAccountService) {}

  @Get()
  async list(@CurrentUser() user: UserPayload) {
    return this.jointAccountService.list(user.sub);
  }

  @Post()
  async create(
    @CurrentUser() user: UserPayload,
    @Body(new ZodValidationPipe(createJointAccountSchema)) body: CreateJointAccountBody
  ) {
    return this.jointAccountService.create(user.sub, body.name);
  }

  @Get(":id")
  async findOne(@CurrentUser() user: UserPayload, @Param("id") id: string) {
    return this.jointAccountService.findOne(id, user.sub);
  }

  @Get(":id/amount")
  async getAmount(@CurrentUser() user: UserPayload, @Param("id") id: string) {
    return this.jointAccountService.getAmount(id, user.sub);
  }

  @Post(":id/invite")
  async invite(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(inviteSchema)) body: InviteBody
  ) {
    return this.jointAccountService.invite(id, user.sub, body.email);
  }

  @Post(":id/leave")
  async leave(@CurrentUser() user: UserPayload, @Param("id") id: string) {
    return this.jointAccountService.leave(id, user.sub);
  }

  @Delete(":id")
  async delete(@CurrentUser() user: UserPayload, @Param("id") id: string) {
    return this.jointAccountService.delete(id, user.sub);
  }
}
