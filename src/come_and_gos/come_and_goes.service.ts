import { CreateComeAndGoDto } from './dto/create-come_and_go.dto';
import { UpdateComeAndGoDto } from './dto/update-come_and_go.dto';
import { ComeAndGo } from './models/come_and_go.model';
import { InjectModel } from '@nestjs/sequelize';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ComeAndGoesService {
  constructor(
    @InjectModel(ComeAndGo)
    private readonly ComeAndGoRepository: typeof ComeAndGo,
  ) {}
  async createComeAndGo(
    createComeAndGoDto: CreateComeAndGoDto,
  ): Promise<{ message: string; newCGO: ComeAndGo }> {
    try {
      const newCGO = await this.ComeAndGoRepository.create(createComeAndGoDto);
      return {
        message: 'Come and go created successfully',
        newCGO,
      };
    } catch (error) {
      throw error;
    }
  }

  async getAllComeAndGoByUserId(user_id: number) {
    const allCGO = await this.ComeAndGoRepository.findAll({
      where: { user_id: user_id },
      include: { all: true },
    });
    return allCGO;
  }

  async getComeAndGoById(id: number) {
    const allCGO = await this.ComeAndGoRepository.findOne({
      where: { id },
      include: { all: true },
    });
    return allCGO;
  }

  async updateComeAndGo(id: number, updateComeAndGoDto: UpdateComeAndGoDto) {
    const updatedCGO = await this.ComeAndGoRepository.update(
      updateComeAndGoDto,
      { where: { id }, returning: true },
    );
    const response = {
      message: 'Come and go updated successfully',
      updatedCGO: updatedCGO[1][0],
    };
    return response;
  }
}
