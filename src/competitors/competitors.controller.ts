import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/jwt.guard';
import { CompetitorsService } from './competitors.service';
import {
  CreateCompetitorDto,
  CreateEncounterDto,
  EncounterQueryDto,
  UpdateCompetitorDto,
  UpdateEncounterDto,
} from './dto/competitor.dto';

@ApiTags('Competitors')
@UseGuards(JwtGuard)
@Controller('competitors')
export class CompetitorsController {
  constructor(private readonly service: CompetitorsService) {}

  @ApiOperation({ summary: "Raqiblar va ular bo'yicha statistika" })
  @Get()
  list(@Req() req: any) {
    return this.service.list(req.payload);
  }

  @Post()
  create(@Body() dto: CreateCompetitorDto, @Req() req: any) {
    return this.service.create(dto, req.payload);
  }

  @ApiOperation({ summary: "Uchrashuvlar (xodim — o'zinikini, admin — hammasini)" })
  @Get('encounters')
  listEncounters(@Query() query: EncounterQueryDto, @Req() req: any) {
    return this.service.listEncounters(query, req.payload);
  }

  @Post('encounters')
  createEncounter(@Body() dto: CreateEncounterDto, @Req() req: any) {
    return this.service.createEncounter(dto, req.payload);
  }

  @Patch('encounters/:id')
  updateEncounter(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEncounterDto,
    @Req() req: any,
  ) {
    return this.service.updateEncounter(id, dto, req.payload);
  }

  @Delete('encounters/:id')
  removeEncounter(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.removeEncounter(id, req.payload);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompetitorDto, @Req() req: any) {
    return this.service.update(id, dto, req.payload);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.payload);
  }
}
