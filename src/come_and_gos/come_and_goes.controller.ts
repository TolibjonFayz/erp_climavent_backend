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
import { ComeAndGoesService } from './come_and_goes.service';
import { CreateComeAndGoDto } from './dto/create-come_and_go.dto';
import { UpdateComeAndGoDto } from './dto/update-come_and_go.dto';
import { ApiProperty } from '@nestjs/swagger';
import { ComeAndGo } from './models/come_and_go.model';
import { JwtGuard } from 'src/guards/jwt.guard';
import { assertOwnerOrAdmin, ownUserId } from 'src/common/ownership';

@UseGuards(JwtGuard)
@Controller('come-and-goes')
export class ComeAndGoesController {
  constructor(private readonly comeAndGoesService: ComeAndGoesService) {}

  // Obyekt egasi — faqat u va admin ko'radi/o'zgartiradi
  private async assertAccess(id: number, req: any) {
    const cgo = await this.comeAndGoesService.getComeAndGoById(id);
    if (!cgo) throw new NotFoundException('Obyekt topilmadi');
    assertOwnerOrAdmin(req.payload, cgo.get('user_id'));
    return cgo;
  }

  //Creating come and go
  @ApiProperty({ description: 'Create a new come and go' })
  @Post('create')
  createComeAndGo(
    @Body() createComeAndGoDto: CreateComeAndGoDto,
    @Req() req: any,
  ): Promise<any> {
    createComeAndGoDto.user_id = ownUserId(req.payload, createComeAndGoDto.user_id);
    return this.comeAndGoesService.createComeAndGo(createComeAndGoDto);
  }

  //A user gets his all come and goes
  @ApiProperty({ description: 'Get all come and goes for a user' })
  @Get('user/:id')
  async getAllComeAndGoes(
    @Param('id') userId: number,
    @Req() req: any,
  ): Promise<ComeAndGo[]> {
    assertOwnerOrAdmin(req.payload, userId);
    return this.comeAndGoesService.getAllComeAndGoByUserId(userId);
  }

  //Get come and go by id
  @Get('one/:id')
  async getOneComeAndGoById(@Param('id') id: number, @Req() req: any) {
    return this.assertAccess(id, req);
  }

  //Updating come and go
  @ApiProperty({ description: 'Update a come and go' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateComeAndGoDto: UpdateComeAndGoDto,
    @Req() req: any,
  ) {
    await this.assertAccess(id, req);
    if (!req.payload.is_admin) delete (updateComeAndGoDto as any).user_id;
    return this.comeAndGoesService.updateComeAndGo(id, updateComeAndGoDto);
  }
}
