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
import { ComeAndGoesService } from './come_and_goes_inside.service';
import { UpdateComeAndGoDto } from './dto/update-come_and_go_inside.dto';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { ComeAndGoInside } from './models/come_and_go_inside.model';
import { UserSelfObyektGuard } from 'src/guards/user_self_obyekt.guard';
import { CreateComeAndGoInsideDto } from './dto/create-come_and_go_inside.dto';

@ApiTags('Come and Goes Inside')
@Controller('come-and-go-inside')
export class ComeAndGoesController {
  constructor(private readonly comeAndGoesService: ComeAndGoesService) {}

  //Creating come and go
  @ApiProperty({ description: 'Create a new come and go' })
  @Post('create')
  createComeAndGo(
    @Body() createComeAndGoInsideDto: CreateComeAndGoInsideDto,
  ): Promise<any> {
    return this.comeAndGoesService.createComeAndGo(createComeAndGoInsideDto);
  }

  // //A user gets his all come and goes
  // @ApiProperty({ description: 'Get all come and goes for a user' })
  // @Get('user/:id')
  // async getAllComeAndGoes(@Param('id') userId: number): Promise<ComeAndGoInside[]> {
  //   return this.comeAndGoesService.getAllComeAndGoesOfAUser(userId);
  // }

  // //Get come and go by id
  // @Get('one/:id')
  // async getOneComeAndGoById(@Param('id') id: number) {
  //   return this.comeAndGoesService.getComeAndGoById(id);
  // }

  //Updating come and go
  @ApiProperty({ description: 'Update a come and go' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateComeAndGoDto: UpdateComeAndGoDto,
  ) {
    return this.comeAndGoesService.updateComeAndGo(id, updateComeAndGoDto);
  }
}
