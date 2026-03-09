import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { defaultCategories } from './categories'

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await hash('admin', 8)

  await prisma.user.upsert({
    where: { email: 'admin@admin.com' },
    update: {},
    create: {
      name: 'admin',
      email: 'admin@admin.com',
      password: hashedPassword
    }
  })

  await prisma.category.deleteMany({ where: { userId: null } })

  for (const parent of defaultCategories) {
    const { children, ...parentData } = parent
    const createdParent = await prisma.category.create({
      data: {
        title: parentData.title,
        description: parentData.description,
        icon: parentData.icon,
        color: parentData.color,
        userId: null
      }
    })

    for (const child of children) {
      await prisma.category.create({
        data: {
          title: child.title,
          description: child.description,
          icon: child.icon,
          color: child.color,
          parentId: createdParent.id,
          userId: null
        }
      })
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })