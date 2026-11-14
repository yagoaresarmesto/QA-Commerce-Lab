import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException, ErrorCode, ValidationDetail } from './errors';

function flatten(errors: ValidationError[], parent = ''): ValidationDetail[] {
  const out: ValidationDetail[] = [];
  for (const err of errors) {
    const field = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) {
      for (const message of Object.values(err.constraints)) out.push({ field, message });
    }
    if (err.children?.length) out.push(...flatten(err.children, field));
  }
  return out;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: true,
    exceptionFactory: (errors) =>
      new AppException(400, ErrorCode.VALIDATION_ERROR, 'La petición contiene datos no válidos', flatten(errors)),
  });
}
