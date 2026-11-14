export class ErrorResponseDto {
  /** HTTP status code */
  statusCode: number;
  /** HTTP reason phrase */
  error: string;
  /** Stable machine readable error code (e.g. INSUFFICIENT_STOCK) */
  code: string;
  /** Human readable message (Spanish) */
  message: string;
  /** Extra information: validation errors ([{ field, message }]) or business context */
  details?: unknown;
  path: string;
  method: string;
  timestamp: string;
  /** Correlation id, also returned in the X-Request-Id header */
  requestId?: string;
}
