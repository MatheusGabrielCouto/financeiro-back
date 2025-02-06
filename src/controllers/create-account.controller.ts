import { Body, ConflictException, Controller, Get, Post, UseGuards, UsePipes } from "@nestjs/common";
import { hash } from "bcryptjs";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from "zod";

const createAccountBodySchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string()
})

type CreateAccountBodySchema = z.infer<typeof createAccountBodySchema>
const bodyValidationCreateAccountPipe = new ZodValidationPipe(createAccountBodySchema)

@Controller('/accounts')
export class CreateAccountControleler {
  constructor(
    private prisma: PrismaService
  ){}

  @Post()
  async handle(
    @Body(bodyValidationCreateAccountPipe) body: CreateAccountBodySchema,
  ) {
    const { name, email, password } = createAccountBodySchema.parse(body)
    
    const userWithSameEmail = await this.prisma.user.findUnique({
      where: {
        email
      }
    })

    if(userWithSameEmail) {
      throw new ConflictException('User with same e-mail address already exists.')
    }

    const hashedPassword = await hash(password, 8)

    await this.prisma.user.create({
      data: {email, name, password: hashedPassword}
    })
  }
}