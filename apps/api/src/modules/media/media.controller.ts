import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { ErrorCode, notFound } from '../../common/errors';
import { CATEGORY_KIND, ILLUSTRATION_KINDS, IllustrationKind, renderProductIllustration } from './illustrations';

/** Serves self-hosted SVG illustrations used as product images. */
@ApiExcludeController()
@Controller('media')
export class MediaController {
  @Get('products/:file')
  @Public()
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=604800, immutable')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  product(
    @Param('file') file: string,
    @Query('c') color = '',
    @Query('v') variant = '0',
    @Query('label') label = '',
  ): string {
    const name = file.replace(/\.svg$/, '');
    const kind = (ILLUSTRATION_KINDS as readonly string[]).includes(name)
      ? (name as IllustrationKind)
      : CATEGORY_KIND[name];
    if (!kind) throw notFound(ErrorCode.NOT_FOUND, 'Imagen no encontrada');
    return renderProductIllustration(kind, color, Number.parseInt(variant, 10) || 0, label);
  }
}
