import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { Authenticated, CurrentUser } from '../../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import {
  AddressDto,
  AddressInputDto,
  ChangePasswordDto,
  RevokedCountDto,
  SessionDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './dto/profile.dto';
import { UserDto } from './dto/user.dto';
import { toAddressDto, UsersService } from './users.service';

@ApiTags('Users')
@Authenticated()
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener el perfil del usuario autenticado' })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.users.getMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar datos personales', description: 'El email no se puede modificar.' })
  @ApiOkResponse({ type: UserDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<UserDto> {
    return this.users.updateMe(user.id, dto);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cambiar la contraseña',
    description: 'Requiere la contraseña actual. Cierra el resto de sesiones del usuario (la actual sigue activa).',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR | CURRENT_PASSWORD_INCORRECT | PASSWORD_REUSED',
    type: ErrorResponseDto,
  })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto): Promise<void> {
    await this.users.changePassword(user.id, user.sessionId, dto);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Listar sesiones activas' })
  @ApiOkResponse({ type: [SessionDto] })
  sessions(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    return this.users.listSessions(user.id, user.sessionId);
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar todas las sesiones excepto la actual' })
  @ApiOkResponse({ type: RevokedCountDto })
  async revokeOthers(@CurrentUser() user: AuthUser): Promise<RevokedCountDto> {
    return { revoked: await this.users.revokeOtherSessions(user.id, user.sessionId) };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar una sesión concreta' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async revokeSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<void> {
    await this.users.revokeSession(user.id, sessionId);
  }

  // ─── Addresses ───

  @Get('addresses')
  @ApiOperation({ summary: 'Listar direcciones (la predeterminada primero)' })
  @ApiOkResponse({ type: [AddressDto] })
  addresses(@CurrentUser() user: AuthUser): Promise<AddressDto[]> {
    return this.users.listAddresses(user.id);
  }

  @Post('addresses')
  @ApiOperation({
    summary: 'Crear dirección',
    description: 'La primera dirección se marca automáticamente como predeterminada. Máximo 10 direcciones.',
  })
  @ApiCreatedResponse({ type: AddressDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'ADDRESS_LIMIT_REACHED', type: ErrorResponseDto })
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: AddressInputDto): Promise<AddressDto> {
    return this.users.createAddress(user.id, dto);
  }

  @Get('addresses/:id')
  @ApiOperation({ summary: 'Obtener una dirección' })
  @ApiOkResponse({ type: AddressDto })
  @ApiNotFoundResponse({ description: 'ADDRESS_NOT_FOUND (también si pertenece a otro usuario)', type: ErrorResponseDto })
  async getAddress(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<AddressDto> {
    return toAddressDto(await this.users.getAddress(user.id, id));
  }

  @Patch('addresses/:id')
  @ApiOperation({ summary: 'Editar dirección' })
  @ApiOkResponse({ type: AddressDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    return this.users.updateAddress(user.id, id, dto);
  }

  @Post('addresses/:id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar dirección como predeterminada' })
  @ApiOkResponse({ type: AddressDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  setDefault(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<AddressDto> {
    return this.users.setDefaultAddress(user.id, id);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar dirección',
    description: 'Si era la predeterminada, la más antigua de las restantes pasa a serlo.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async deleteAddress(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.users.deleteAddress(user.id, id);
  }
}
