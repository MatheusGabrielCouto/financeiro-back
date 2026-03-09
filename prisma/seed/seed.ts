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

  await prisma.category.createMany({
    data: defaultCategories.map(c => ({
      title: c.title,
      description: c.description,
      userId: null
    }))
  })
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