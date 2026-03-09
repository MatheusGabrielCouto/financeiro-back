import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JointAccountRole } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class JointAccountService {
  constructor(private prisma: PrismaService) {}

  async ensureMemberAccess(jointAccountId: string, userId: string) {
    const membership = await this.prisma.userJointAccount.findUnique({
      where: {
        userId_jointAccountId: { userId, jointAccountId },
      },
      include: { jointAccount: true },
    });
    if (!membership) throw new NotFoundException("Conta conjunta não encontrada");
    return membership;
  }

  async ensureOwnerAccess(jointAccountId: string, userId: string) {
    const membership = await this.ensureMemberAccess(jointAccountId, userId);
    if (membership.role !== JointAccountRole.OWNER) {
      throw new ForbiddenException("Apenas o dono pode realizar esta ação");
    }
    return membership;
  }

  async list(userId: string) {
    const memberships = await this.prisma.userJointAccount.findMany({
      where: { userId },
      include: {
        jointAccount: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return memberships.map((m) => ({
      id: m.jointAccount.id,
      name: m.jointAccount.name,
      amount: m.jointAccount.amount,
      role: m.role,
      createdAt: m.jointAccount.createdAt,
    }));
  }

  async create(userId: string, name: string) {
    return this.prisma.jointAccount.create({
      data: {
        name,
        members: {
          create: {
            userId,
            role: JointAccountRole.OWNER,
          },
        },
      },
    });
  }

  async findOne(jointAccountId: string, userId: string) {
    const membership = await this.ensureMemberAccess(jointAccountId, userId);
    const members = await this.prisma.userJointAccount.findMany({
      where: { jointAccountId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return {
      ...membership.jointAccount,
      role: membership.role,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
    };
  }

  async getAmount(jointAccountId: string, userId: string) {
    const membership = await this.ensureMemberAccess(jointAccountId, userId);
    return {
      amount: membership.jointAccount.amount,
    };
  }

  async invite(jointAccountId: string, inviterId: string, email: string) {
    await this.ensureOwnerAccess(jointAccountId, inviterId);

    const invitedUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!invitedUser) {
      throw new NotFoundException("Usuário não encontrado com este e-mail");
    }

    const existing = await this.prisma.userJointAccount.findUnique({
      where: {
        userId_jointAccountId: {
          userId: invitedUser.id,
          jointAccountId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException("Usuário já é membro desta conta");
    }

    await this.prisma.userJointAccount.create({
      data: {
        userId: invitedUser.id,
        jointAccountId,
        role: JointAccountRole.MEMBER,
      },
    });

    return {
      message: `${invitedUser.name} foi adicionado à conta conjunta`,
    };
  }

  async leave(jointAccountId: string, userId: string) {
    const membership = await this.ensureMemberAccess(jointAccountId, userId);
    if (membership.role === JointAccountRole.OWNER) {
      const memberCount = await this.prisma.userJointAccount.count({
        where: { jointAccountId },
      });
      if (memberCount > 1) {
        throw new BadRequestException(
          "O dono deve transferir a propriedade ou excluir a conta antes de sair"
        );
      }
    }

    await this.prisma.userJointAccount.delete({
      where: {
        userId_jointAccountId: { userId, jointAccountId },
      },
    });

    return { message: "Você saiu da conta conjunta" };
  }

  async delete(jointAccountId: string, userId: string) {
    await this.ensureOwnerAccess(jointAccountId, userId);

    await this.prisma.jointAccount.delete({
      where: { id: jointAccountId },
    });

    return { message: "Conta conjunta excluída" };
  }
}
