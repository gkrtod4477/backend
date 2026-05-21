import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ApiResponse } from '../types/api-response.type';

function deriveErrorCode(status: number): string {
  const entry = Object.entries(HttpStatus).find(([, value]) => value === status);
  return entry ? entry[0] : 'INTERNAL_SERVER_ERROR';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    // Use untyped response to avoid @types/express v5 StatusCode type constraint
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest<{ requestId?: string }>();

    const requestId = request.requestId ?? randomUUID();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        errorCode = deriveErrorCode(statusCode);
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;

        if (Array.isArray(resp['message'])) {
          // Preserve explicit domain error code; fall back to VALIDATION_ERROR for ValidationPipe output
          errorCode =
            typeof resp['code'] === 'string' ? resp['code'] : 'VALIDATION_ERROR';
          message = (resp['message'] as string[]).join('; ');
        } else {
          errorCode =
            typeof resp['code'] === 'string' ? resp['code'] : deriveErrorCode(statusCode);
          message =
            typeof resp['message'] === 'string' ? resp['message'] : exception.message;
        }
      }
    } else {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : exception,
      );
    }

    const body: ApiResponse<null> = {
      data: null,
      meta: { requestId },
      error: { code: errorCode, message },
    };

    response.status(statusCode).json(body);
  }
}
