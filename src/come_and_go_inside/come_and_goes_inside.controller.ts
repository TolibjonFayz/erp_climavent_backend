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
import { CreateComeAndGoInsideDto } from './dto/create-come_and_go_inside.dto';
import { UpdateComeAndGoInsideDto } from './dto/update-come_and_go_inside.dto';
import { ComeAndGoesService } from './come_and_goes_inside.service';
import { ComeAndGoInside } from './models/come_and_go_inside.model';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';

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

  //Get all come and goes
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Get all come and goes' })
  @Get('all')
  async getAllComeAndGoes(): Promise<ComeAndGoInside[]> {
    return this.comeAndGoesService.getAllComeAndGos();
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
    @Body() updateComeAndGoDto: UpdateComeAndGoInsideDto,
  ) {
    return this.comeAndGoesService.updateComeAndGo(id, updateComeAndGoDto);
  }
}
  