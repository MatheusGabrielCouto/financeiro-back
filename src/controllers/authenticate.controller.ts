import { Body, Controller, Post, UnauthorizedException, UsePipes } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from 'zod'

const sessionBodySchema = z.object({
  email: z.string().email(),
  password: z.string()
})

type SessionBodySchema = z.infer<typeof sessionBodySchema>

@Controller('/sessions')
export class AuthenticateController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService
  ){}

  @Post()
  @UsePipes(new ZodValidationPipe(sessionBodySchema))
  async handle(
    @Body() body: SessionBodySchema,
  ) {
    const { email, password } = body

    const user = await this.prisma.user.findUnique({
      where: {
        email
      }
    })

    if (!user) {
      throw new UnauthorizedException('User credentials do not match')
    }
    
    const isPasswordValid = await compare(password, user.password)
    
    if(!isPasswordValid) {
      throw new UnauthorizedException('User credentials do not match')
    }

    const accessToken = this.jwt.sign({ sub: user.id })

    const { password: test, amount, ...userWithoutSensitiveData } = user

    return {
      access_token: accessToken,
      user: userWithoutSensitiveData
    }
  }
}