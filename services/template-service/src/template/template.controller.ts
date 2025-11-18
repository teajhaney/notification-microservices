import {
  Controller,
  Post,
  Body,
  Req,
  UnauthorizedException,
  Get,
  Query,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { TemplateService } from './template.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateTemplateDto,
  PaginationDto,
  RenderTemplateDto,
  UpdateTemplateDto,
} from './dto/create.template.dto';
import type { JwtRequest, RenderedMessage } from 'src/types/types';
import { NotificationChannel } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('template')
export class TemplateController {
  constructor(private readonly templatesService: TemplateService) {}
  @Post()
  create(@Body() createTemplateDto: CreateTemplateDto, @Req() req: JwtRequest) {
    try {
      const role = req.user.role;
      if (role !== 'admin') {
        throw new UnauthorizedException(
          'Forbidden: You are not authorized to create a template',
        );
      }
      return this.templatesService.create(createTemplateDto);
    } catch (error) {
      console.log(error);
    }
  }

  @Get()
  getAllTemplates(
    @Query() paginationDto: PaginationDto,
    @Query('name') name?: string,
    @Query('language') language?: string,
    @Query('event') event?: string,
    @Query('channel') channel?: string,
  ) {
    const channelEnum = channel
      ? [channel.toUpperCase() as NotificationChannel]
      : undefined;
    const filters = { name, language, event, channel: channelEnum };
    return this.templatesService.getPaginatedTemplates(paginationDto, filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('history') includeHistory?: boolean) {
    return this.templatesService.findOne(id, includeHistory);
  }

  @Post(':id/render')
  render(
    @Param('id') id: string,
    @Body() renderDto?: RenderTemplateDto,
  ): Promise<RenderedMessage[]> {
    return this.templatesService.render(id, renderDto);
  }

  /**
   * Get ALL templates for an event and language
   *
   * Endpoint: GET /template/event/:event?language=en
   *
   * This returns all active templates for the event/language.
   * Channels are determined from the templates themselves (their channel arrays).
   * This is the preferred method - channels come from templates, not from the request.
   */
  @Get('event/:event')
  getAllTemplatesByEvent(
    @Param('event') event: string,
    @Query('language') language?: string,
  ) {
    return this.templatesService.getAllTemplatesByEvent(
      event.toUpperCase(),
      language ?? 'en',
    );
  }

  /**
   * Get template by event, channel, and language
   *
   * Endpoint: GET /template/event/:event/:channel?language=en
   *
   * IMPORTANT: The database stores channel as an array (e.g., [EMAIL, PUSH]),
   * so we need to pass an array to the service method, even though we're
   * requesting a specific channel. The service will find templates where
   * the channel array contains the requested channel.
   *
   * NOTE: This is kept for backward compatibility, but prefer using
   * GET /template/event/:event to get all templates and determine channels from them.
   */
  @Get('event/:event/:channel')
  getByEvent(
    @Param('event') event: string,
    @Param('channel') channel: NotificationChannel,
    @Query('language') language?: string,
  ) {
    // Convert single channel to array (service expects array)
    const channelEnum = channel.toUpperCase() as NotificationChannel;
    const channelsArray = [channelEnum]; // Wrap in array

    return this.templatesService.getByEvent(
      event.toUpperCase(),
      channelsArray, // Pass as array
      language ?? 'en',
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ) {
    return this.templatesService.update(id, updateTemplateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templatesService.delete(id);
  }
}
