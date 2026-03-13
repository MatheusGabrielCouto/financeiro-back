import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().optional().default(3333),
  JWT_PRIVATE_KEY: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().optional().default(7),
  EXPO_ACCESS_TOKEN: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>