import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { ApiProperty } from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtGuard } from 'src/guards/jwt.guard';
import { assertOwnerOrAdmin, ownUserId } from 'src/common/ownership';

@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  // Mijoz egasi — faqat u va admin ko'radi/o'zgartiradi
  private async assertAccess(id: number, req: any) {
    const partner = await this.partnersService.findOnePartner(id);
    if (!partner) throw new NotFoundException('Mijoz topilmadi');
    assertOwnerOrAdmin(req.payload, partner.get('user_id'));
    return partner;
  }

  //Create a partner
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Create a new partner' })
  @Post('create')
  create(@Body() createPartnerDto: CreatePartnerDto, @Req() req: any) {
    createPartnerDto.user_id = ownUserId(req.payload, createPartnerDto.user_id);
    return this.partnersService.createPartner(createPartnerDto);
  }

  //Get all partners
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Get all partners' })
  @Get('all')
  findAll() {
    return this.partnersService.findAllPartners();
  }

  //Get all partners of a user
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Get all partners for a user' })
  @Get('userall/:id')
  findAllOfAUser(@Param('id') id: string, @Req() req: any) {
    assertOwnerOrAdmin(req.payload, id);
    return this.partnersService.findAllPartnersOfAUser(+id);
  }

  //Get a partner by id
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Get a partner by id' })
  @Get('one/:id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.assertAccess(+id, req);
  }

  //Update a partner by id
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Update a partner by id' })
  @Patch('update/:id')
  async update(
    @Param('id') id: string,
    @Body() updatePartnerDto: UpdatePartnerDto,
    @Req() req: any,
  ) {
    await this.assertAccess(+id, req);
    // Mijozni boshqa xodimga o'tkazish — faqat admin
    if (!req.payload.is_admin) delete (updatePartnerDto as any).user_id;
    return this.partnersService.updatePartner(+id, updatePartnerDto);
  }

  //Remove a partner by id
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Remove a partner by id' })
  @Delete('delete/:id')
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.assertAccess(+id, req);
    return this.partnersService.removePartner(+id);
  }
}
