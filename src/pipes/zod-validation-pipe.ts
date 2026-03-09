import { PipeTransform, BadRequestException } from '@nestjs/common'
import { ZodError, ZodSchema } from 'zod'
import { fromZodError } from 'zod-validation-error'

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: any) {
    try {
      this.schema.parse(value)
    } catch (error) {
      if(error instanceof ZodError) {
        throw new BadRequestException({errors: fromZodError(error), message: 'Falha na validação', statusCode: 400})
      }
      throw new BadRequestException('Falha na validação')
    }

    return value
  }
}