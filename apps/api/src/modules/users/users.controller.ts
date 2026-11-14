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
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.users.getMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update personal details', description: 'The e-mail cannot be changed.' })
  @ApiOkResponse({ type: UserDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<UserDto> {
    return this.users.updateMe(user.id, dto);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change the password',
    description: 'Requires the current password. Signs out the user\'s other sessions (the current one stays active).',
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
  @ApiOperation({ summary: 'List active sessions' })
  @ApiOkResponse({ type: [SessionDto] })
  sessions(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    return this.users.listSessions(user.id, user.sessionId);
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out every session except the current one' })
  @ApiOkResponse({ type: RevokedCountDto })
  async revokeOthers(@CurrentUser() user: AuthUser): Promise<RevokedCountDto> {
    return { revoked: await this.users.revokeOtherSessions(user.id, user.sessionId) };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out a specific session' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async revokeSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<void> {
    await this.users.revokeSession(user.id, sessionId);
  }

  // ─── Addresses ───

  @Get('addresses')
  @ApiOperation({ summary: 'List addresses (default first)' })
  @ApiOkResponse({ type: [AddressDto] })
  addresses(@CurrentUser() user: AuthUser): Promise<AddressDto[]> {
    return this.users.listAddresses(user.id);
  }

  @Post('addresses')
  @ApiOperation({
    summary: 'Create an address',
    description: 'The first address automatically becomes the default. Up to 10 addresses.',
  })
  @ApiCreatedResponse({ type: AddressDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'ADDRESS_LIMIT_REACHED', type: ErrorResponseDto })
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: AddressInputDto): Promise<AddressDto> {
    return this.users.createAddress(user.id, dto);
  }

  @Get('addresses/:id')
  @ApiOperation({ summary: 'Get an address' })
  @ApiOkResponse({ type: AddressDto })
  @ApiNotFoundResponse({ description: 'ADDRESS_NOT_FOUND (also when it belongs to another user)', type: ErrorResponseDto })
  async getAddress(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<AddressDto> {
    return toAddressDto(await this.users.getAddress(user.id, id));
  }

  @Patch('addresses/:id')
  @ApiOperation({ summary: 'Update an address' })
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
  @ApiOperation({ summary: 'Set an address as default' })
  @ApiOkResponse({ type: AddressDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  setDefault(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<AddressDto> {
    return this.users.setDefaultAddress(user.id, id);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an address',
    description: 'If it was the default, the oldest remaining address becomes the default.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async deleteAddress(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.users.deleteAddress(user.id, id);
  }
}
