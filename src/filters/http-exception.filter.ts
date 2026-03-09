import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

const MENSAGENS_PT: Record<string, string> = {
  Unauthorized: "Não autorizado. Faça login novamente.",
  Forbidden: "Acesso negado.",
  "Not Found": "Recurso não encontrado.",
  "Bad Request": "Requisição inválida.",
  "Conflict": "Conflito. O recurso já existe.",
  "Internal Server Error": "Erro interno do servidor.",
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Erro interno do servidor.";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (
        typeof exceptionResponse === "object" &&
        exceptionResponse !== null &&
        !Array.isArray(exceptionResponse)
      ) {
        const msg =
          "message" in exceptionResponse
            ? (exceptionResponse as { message: string | string[] }).message
            : exception.message;
        const msgStr = Array.isArray(msg) ? msg[0] : String(msg);
        const translatedMsg = MENSAGENS_PT[msgStr] ?? msgStr;

        response.status(status).json({
          ...(exceptionResponse as object),
          message: translatedMsg,
        });
        return;
      }

      const msgStr = String(exceptionResponse);
      message = MENSAGENS_PT[msgStr] ?? msgStr ?? message;
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      message,
    });
  }
}
