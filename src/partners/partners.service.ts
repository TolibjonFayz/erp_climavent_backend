import { Injectable } from '@nestjs/common';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Partners } from './models/partner.model';

@Injectable()
export class PartnersService {
  constructor(
    @InjectModel(Partners) private readonly PartnersRepository: typeof Partners,
  ) {}

  //Creating a partner
  createPartner(createPartnerDto: CreatePartnerDto) {
    try {
      return this.PartnersRepository.create(createPartnerDto);
    } catch (error) {
      console.error('Error creating partner:', error);
      throw error;
    }
  }

  //Get all partners
  findAllPartners() {
    return this.PartnersRepository.findAll({
      include: { all: true },
      order: [['createdAt', 'DESC']],
    });
  }

  //Get all partners of a user
  findAllPartnersOfAUser(id: number) {
    return this.PartnersRepository.findAll({
      where: { user_id: id },
      order: [['createdAt', 'DESC']],
      include: { all: true },
    });
  }

  //Get a partner by id
  findOnePartner(id: number) {
    return this.PartnersRepository.findByPk(id, { include: { all: true } });
  }

  //Update a partner by id
  updatePartner(id: number, updatePartnerDto: UpdatePartnerDto) {
    return this.PartnersRepository.update(updatePartnerDto, {
      where: { id },
      returning: true,
    });
  }

  //Remove a partner by id
  removePartner(id: number) {
    return this.PartnersRepository.destroy({ where: { id } });
  }
}
