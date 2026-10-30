import { CreateComeAndGoDto } from './dto/create-come_and_go.dto';
import { UpdateComeAndGoDto } from './dto/update-come_and_go.dto';
import { ComeAndGo } from './models/come_and_go.model';
import { InjectModel } from '@nestjs/sequelize';
import { Injectable } from '@nestjs/common';
import { ComeAndGoInside } from 'src/come_and_go_inside/models/come_and_go_inside.model';
import { LocationVideo } from 'src/location_videos/models/location_video.model';

@Injectable()
export class ComeAndGoesService {
  constructor(
    @InjectModel(ComeAndGo)
    private readonly ComeAndGoRepository: typeof ComeAndGo,
  ) {}
  // Obyekt yozuvi tashriflari va videolari bilan bitta tranzaksiyada o'chadi
  async removeComeAndGo(id: number) {
    const sequelize = this.ComeAndGoRepository.sequelize!;
    await sequelize.transaction(async (transaction) => {
      await LocationVideo.destroy({ where: { comeandgo_id: id }, transaction });
      await ComeAndGoInside.destroy({ where: { come_and_go_father_id: id }, transaction });
      await this.ComeAndGoRepository.destroy({ where: { id }, transaction });
    });
    return { deleted: true };
  }

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
