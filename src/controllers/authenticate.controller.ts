import { Body, Controller, Post, UnauthorizedException, UsePipes } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import { randomUUID } from "crypto";
import { ZodValidationPipe } from "src/pipes/zod-validation-pipe";
import { PrismaService } from "src/prisma/prisma.service";
import { z } from 'zod'
import { Env } from "src/env";

const sessionBodySchema = z.object({
  email: z.string().email(),
  password: z.string()
})

type SessionBodySchema = z.infer<typeof sessionBodySchema>

const refreshBodySchema = z.object({
  refresh_token: z.string().uuid()
})

type RefreshBodySchema = z.infer<typeof refreshBodySchema>

@Controller('/sessions')
export class AuthenticateController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService<Env, true>
  ){}

  @Post()
  @UsePipes(new ZodValidationPipe(sessionBodySchema))
  async handle(
    @Body() body: SessionBodySchema,
  ) {
    const { email, password } = body

    const user = await this.prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      throw new UnauthorizedException('E-mail ou senha incorretos')
    }
    
    const isPasswordValid = await compare(password, user.password)
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('E-mail ou senha incorretos')
    }

    const accessToken = this.jwt.sign({ sub: user.id })
    const refreshToken = randomUUID()
    const expiresDays = this.config.get('REFRESH_TOKEN_EXPIRES_DAYS', { infer: true })
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresDays)

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt
      }
    })

    const { password: _, ...userWithoutSensitiveData } = user

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
      user: userWithoutSensitiveData
    }
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(refreshBodySchema))
  async refresh(@Body() body: RefreshBodySchema) {
    const { refresh_token } = body

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refresh_token },
      include: { user: true }
    })

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token inválido')
    }

    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } })
      throw new UnauthorizedException('Refresh token expirado')
    }

    const accessToken = this.jwt.sign({ sub: storedToken.userId })
    const { password: _, ...user } = storedToken.user

    return {
      access_token: accessToken,
      user
    }
  }

  @Post('logout')
  @UsePipes(new ZodValidationPipe(refreshBodySchema))
  async logout(@Body() body: RefreshBodySchema) {
    await this.prisma.refreshToken.deleteMany({
      where: { token: body.refresh_token }
    })
    return { success: true }
  }
}