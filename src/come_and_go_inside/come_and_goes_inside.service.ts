import { CreateComeAndGoInsideDto } from './dto/create-come_and_go_inside.dto';
import { UpdateComeAndGoDto } from './dto/update-come_and_go_inside.dto';
import { ComeAndGoInside } from './models/come_and_go_inside.model';
import { InjectModel } from '@nestjs/sequelize';
import { Injectable } from '@nestjs/common';
import { ComeAndGo } from 'src/come_and_gos/models/come_and_go.model';
import { User } from 'src/users/models/user.model';

@Injectable()
export class ComeAndGoesService {
  constructor(
    @InjectModel(ComeAndGoInside)
    private readonly ComeAndGoInsideRepository: typeof ComeAndGoInside,
  ) {}

  //Creating come and go service
  async createComeAndGo(
    createComeAndGoInsideDto: CreateComeAndGoInsideDto,
  ): Promise<{ message: string; newCGO: ComeAndGoInside }> {
    try {
      const newCGO = await this.ComeAndGoInsideRepository.create(
        createComeAndGoInsideDto,
      );
      return {
        message: 'Come and go created successfully',
        newCGO,
      };
    } catch (error) {
      throw error;
    }
  }

  // //A user gets his all come and goes
  // async getAllComeAndGoesOfAUser(userId: number) {
  //   const allCGO = await this.ComeAndGoRepository.findAll({
  //     where: { user_id: userId },
  //     order: [['createdAt', 'DESC']],
  //   });

  //   return allCGO;
  // }

  //Get come and go by id
  async getComeAndGoById(id: number) {
    const allCGO = await this.ComeAndGoInsideRepository.findOne({
      where: { id },
    });
    return allCGO;
  }

  //Get all come and gos
  async getAllComeAndGos() {
    const allCGO = await this.ComeAndGoInsideRepository.findAll({
      include: [
        {
          model: ComeAndGo,
          include: [{ model: User }],
        },
      ],
    });
    return allCGO;
  }

  //Updating come and go
  async updateComeAndGo(id: number, updateComeAndGoDto: UpdateComeAndGoDto) {
    const updatedCGO = await this.ComeAndGoInsideRepository.update(
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
