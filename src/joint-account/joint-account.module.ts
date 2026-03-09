import { Module } from "@nestjs/common";
import { PrismaModule } from "src/modules/prisma.module";
import { JointAccountController } from "./joint-account.controller";
import { JointAccountService } from "./joint-account.service";

@Module({
  imports: [PrismaModule],
  controllers: [JointAccountController],
  providers: [JointAccountService],
  exports: [JointAccountService],
})
export class JointAccountModule {}
