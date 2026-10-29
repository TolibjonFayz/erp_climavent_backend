import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { CreateComeAndGoInsideDto } from './dto/create-come_and_go_inside.dto';
import { UpdateComeAndGoInsideDto } from './dto/update-come_and_go_inside.dto';
import { ComeAndGoesService } from './come_and_goes_inside.service';
import { ComeAndGoInside } from './models/come_and_go_inside.model';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtGuard } from 'src/guards/jwt.guard';
import { ComeAndGo } from 'src/come_and_gos/models/come_and_go.model';
import { assertOwnerOrAdmin, ownUserId } from 'src/common/ownership';

@ApiTags('Come and Goes Inside')
@Controller('come-and-go-inside')
export class ComeAndGoesController {
  constructor(private readonly comeAndGoesService: ComeAndGoesService) {}

  // Tashrif egasi = ota obyekt (come_and_go) egasi
  private async assertFatherAccess(fatherId: unknown, req: any) {
    if (req.payload.is_admin) return;
    const father = fatherId != null ? await ComeAndGo.findByPk(Number(fatherId)) : null;
    if (!father) throw new NotFoundException('Obyekt topilmadi');
    assertOwnerOrAdmin(req.payload, father.get('user_id'));
  }

  //Creating come and go
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Create a new come and go' })
  @Post('create')
  async createComeAndGo(
    @Body() createComeAndGoInsideDto: CreateComeAndGoInsideDto,
    @Req() req: any,
  ): Promise<any> {
    await this.assertFatherAccess(createComeAndGoInsideDto.come_and_go_father_id, req);
    createComeAndGoInsideDto.user_id = ownUserId(req.payload, createComeAndGoInsideDto.user_id);
    return this.comeAndGoesService.createComeAndGo(createComeAndGoInsideDto);
  }

  //Get all come and goes
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Get all come and goes' })
  @Get('all')
  async getAllComeAndGoes(): Promise<ComeAndGoInside[]> {
    return this.comeAndGoesService.getAllComeAndGos();
  }

  //Updating come and go
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Update a come and go' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateComeAndGoDto: UpdateComeAndGoInsideDto,
    @Req() req: any,
  ) {
    const visit = await this.comeAndGoesService.getComeAndGoById(id);
    if (!visit) throw new NotFoundException('Tashrif topilmadi');
    await this.assertFatherAccess(visit.get('come_and_go_father_id'), req);
    if (!req.payload.is_admin) {
      // Tashrifni boshqa obyektga yoki xodimga o'tkazib bo'lmaydi
      delete (updateComeAndGoDto as any).come_and_go_father_id;
      delete (updateComeAndGoDto as any).user_id;
    }
    return this.comeAndGoesService.updateComeAndGo(id, updateComeAndGoDto);
  }
}
