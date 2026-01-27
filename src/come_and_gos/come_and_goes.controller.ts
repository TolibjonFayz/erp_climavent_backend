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
import { ComeAndGoesService } from './come_and_goes.service';
import { CreateComeAndGoDto } from './dto/create-come_and_go.dto';
import { UpdateComeAndGoDto } from './dto/update-come_and_go.dto';
import { ApiProperty } from '@nestjs/swagger';
import { ComeAndGo } from './models/come_and_go.model';
import { UserSelfObyektGuard } from 'src/guards/user_self_obyekt.guard';

@Controller('come-and-goes')
export class ComeAndGoesController {
  constructor(private readonly comeAndGoesService: ComeAndGoesService) {}

  //Creating come and go
  @ApiProperty({ description: 'Create a new come and go' })
  @Post('create')
  createComeAndGo(
    @Body() createComeAndGoDto: CreateComeAndGoDto,
  ): Promise<any> {
    return this.comeAndGoesService.createComeAndGo(createComeAndGoDto);
  }

  //A user gets his all come and goes
  @ApiProperty({ description: 'Get all come and goes for a user' })
  @Get('user/:id')
  async getAllComeAndGoes(
    @Param('id') userId: number,
  ): Promise<ComeAndGo[]> {
    return this.comeAndGoesService.getAllComeAndGoByUserId(userId);
  }

  //Get come and go by id
  @UseGuards(UserSelfObyektGuard)
  @Get('one/:id')
  async getOneComeAndGoById(@Param('id') id: number) {
    return this.comeAndGoesService.getComeAndGoById(id);
  }

  //Updating come and go
  @UseGuards(UserSelfObyektGuard)
  @ApiProperty({ description: 'Update a come and go' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateComeAndGoDto: UpdateComeAndGoDto,
  ) {
    return this.comeAndGoesService.updateComeAndGo(id, updateComeAndGoDto);
  }
}
