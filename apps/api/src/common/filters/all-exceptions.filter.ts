import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { AppException, ErrorCode } from '../errors';
import { RequestContext } from '../request-context';

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Converts every error into the documented JSON error envelope:
 * { statusCode, error, code, message, details?, path, method, timestamp, requestId }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const err = this.normalize(exception);

    if (err.status >= 500 && err.code !== ErrorCode.FAULT_INJECTED) {
      const detail = exception instanceof Error ? exception.stack : JSON.stringify(exception);
      this.logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${detail}`);
    }

    if (res.headersSent) return;
    res.status(err.status).json({
      statusCode: err.status,
      error: STATUS_CODES[err.status] ?? 'Error',
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
      requestId: RequestContext.requestId() ?? (req as Request & { id?: string }).id,
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: ErrorCode.RATE_LIMITED,
        message: 'Demasiadas peticiones. Inténtalo de nuevo en unos segundos.',
      };
    }
    // body-parser errors (Nest may wrap them in a BadRequestException)
    const bodyError = (exception as { type?: string } | null)?.type ?? ((exception as { cause?: { type?: string } } | null)?.cause?.type);
    if (bodyError === 'entity.parse.failed' || (exception instanceof SyntaxError && 'body' in (exception as object))) {
      return { status: 400, code: ErrorCode.INVALID_JSON, message: 'El cuerpo de la petición no es un JSON válido' };
    }
    if (bodyError === 'entity.too.large') {
      return { status: 413, code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'El cuerpo de la petición es demasiado grande' };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let message: string;
      if (typeof response === 'string') {
        message = response;
      } else {
        const m = (response as { message?: unknown }).message;
        message = Array.isArray(m) ? m.join('; ') : typeof m === 'string' ? m : exception.message;
      }
      if (status === 400 && /in JSON at position|Unexpected token|Unexpected end of JSON/.test(message)) {
        return { status: 400, code: ErrorCode.INVALID_JSON, message: 'El cuerpo de la petición no es un JSON válido' };
      }
      return { status, code: this.codeForStatus(status, message), message };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: 409,
          code: ErrorCode.CONFLICT,
          message: 'El recurso ya existe',
          details: { target: exception.meta?.target },
        };
      }
      if (exception.code === 'P2025') {
        return { status: 404, code: ErrorCode.NOT_FOUND, message: 'Recurso no encontrado' };
      }
      if (exception.code === 'P2003') {
        return { status: 409, code: ErrorCode.CONFLICT, message: 'El recurso está referenciado por otros datos' };
      }
    }
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return { status: 503, code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Base de datos no disponible' };
    }
    return { status: 500, code: ErrorCode.INTERNAL_ERROR, message: 'Error interno del servidor' };
  }

  private codeForStatus(status: number, message: string): string {
    switch (status) {
      case 400:
        return ErrorCode.VALIDATION_ERROR;
      case 401:
        return ErrorCode.UNAUTHENTICATED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return message.startsWith('Cannot ') ? ErrorCode.ROUTE_NOT_FOUND : ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.CONFLICT;
      case 413:
        return ErrorCode.PAYLOAD_TOO_LARGE;
      case 429:
        return ErrorCode.RATE_LIMITED;
      case 503:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return status >= 500 ? ErrorCode.INTERNAL_ERROR : `HTTP_${status}`;
    }
  }
}
