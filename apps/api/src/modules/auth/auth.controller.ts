import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig } from '../../config/app-config';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser, OptionalAuth, Public } from '../../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { ErrorCode, badRequest } from '../../common/errors';
import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  ForgotPasswordDto,
  LoginDto,
  MessageResponseDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  ResetTokenStatusDto,
} from './dto/auth.dto';

export const REFRESH_COOKIE = 'qcl_rt';
// Stricter limit for credential endpoints (only applies when RATE_LIMIT_ENABLED=true, e.g. public demo).
const AUTH_THROTTLE = { default: { limit: () => Number(process.env.RATE_LIMIT_AUTH_PER_MINUTE ?? 20) || 20, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Post('register')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Registrar un nuevo usuario',
    description: 'Crea la cuenta (rol CUSTOMER), inicia sesión y devuelve los tokens. No requiere verificación de email.',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Datos no válidos (VALIDATION_ERROR)', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'Email ya registrado (EMAIL_ALREADY_REGISTERED)', type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Solo si el rate limiting está habilitado (demo)', type: ErrorResponseDto })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto, this.meta(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return result;
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Devuelve access token (JWT, cabecera Authorization: Bearer) y refresh token (también como cookie httpOnly qcl_rt). ' +
      'Nunca bloquea cuentas por intentos fallidos.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Credenciales incorrectas (INVALID_CREDENTIALS)', type: ErrorResponseDto })
  @ApiForbiddenResponse({ description: 'Cuenta desactivada (ACCOUNT_DISABLED)', type: ErrorResponseDto })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, this.meta(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return result;
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh-cookie')
  @ApiOperation({
    summary: 'Renovar el access token',
    description: 'Acepta el refresh token en el cuerpo ({ refreshToken }) o en la cookie qcl_rt.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'REFRESH_TOKEN_INVALID | SESSION_REVOKED | SESSION_EXPIRED',
    type: ErrorResponseDto,
  })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    try {
      return await this.auth.refresh(token);
    } catch (err) {
      if (!dto.refreshToken) this.clearRefreshCookie(res);
      throw err;
    }
  }

  @Post('logout')
  @OptionalAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar sesión',
    description:
      'Revoca la sesión del access token enviado o, si no hay, la del refresh token (cuerpo o cookie). Idempotente.',
  })
  @ApiNoContentResponse()
  async logout(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user?.sessionId, dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined));
    this.clearRefreshCookie(res);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Solicitar recuperación de contraseña',
    description:
      'Siempre responde 202 (no revela si el email existe). Si existe, se envía un email al buzón simulado con un enlace de un solo uso.',
  })
  @ApiAcceptedResponse({ type: MessageResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    await this.auth.forgotPassword(dto.email);
    return { message: 'Si el email está registrado, recibirás un enlace para restablecer la contraseña' };
  }

  @Get('reset-password/validate')
  @Public()
  @ApiOperation({ summary: 'Comprobar si un token de recuperación es válido' })
  @ApiQuery({ name: 'token', required: true })
  @ApiOkResponse({ type: ResetTokenStatusDto })
  @ApiBadRequestResponse({
    description: 'RESET_TOKEN_INVALID | RESET_TOKEN_EXPIRED | RESET_TOKEN_USED',
    type: ErrorResponseDto,
  })
  validateResetToken(@Query('token') token?: string): Promise<ResetTokenStatusDto> {
    if (!token) throw badRequest(ErrorCode.RESET_TOKEN_INVALID, 'El enlace de recuperación no es válido');
    return this.auth.validateResetToken(token);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Restablecer la contraseña con el token recibido por email',
    description: 'El token es de un solo uso y caduca (PASSWORD_RESET_TTL_MINUTES). Cierra todas las sesiones abiertas.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR | RESET_TOKEN_INVALID | RESET_TOKEN_EXPIRED | RESET_TOKEN_USED',
    type: ErrorResponseDto,
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  private meta(req: Request) {
    return { userAgent: req.header('user-agent'), ip: req.ip };
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.config.cookieSecure, path: '/api/auth' };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, { ...this.cookieOptions(), expires: expiresAt });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
