import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { ApiProperty } from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';

@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  //Create a partner
  @ApiProperty({ description: 'Create a new partner' })
  @Post('create')
  create(@Body() createPartnerDto: CreatePartnerDto) {
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
  @ApiProperty({ description: 'Get all partners for a user' })
  @Get('userall/:id')
  findAllOfAUser(@Param('id') id: string) {
    return this.partnersService.findAllPartnersOfAUser(+id);
  }

  //Get a partner by id
  @ApiProperty({ description: 'Get a partner by id' })
  @Get('one/:id')
  findOne(@Param('id') id: string) {
    return this.partnersService.findOnePartner(+id);
  }

  //Update a partner by id
  @ApiProperty({ description: 'Update a partner by id' })
  @Patch('update/:id')
  update(@Param('id') id: string, @Body() updatePartnerDto: UpdatePartnerDto) {
    return this.partnersService.updatePartner(+id, updatePartnerDto);
  }

  //Remove a partner by id
  @ApiProperty({ description: 'Remove a partner by id' })
  @Delete('delete/:id')
  remove(@Param('id') id: string) {
    return this.partnersService.removePartner(+id);
  }
}
