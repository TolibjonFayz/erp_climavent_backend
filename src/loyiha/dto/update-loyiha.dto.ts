import { PartialType } from '@nestjs/swagger';
import { CreateLoyihaDto } from './create-loyiha.dto';

export class UpdateLoyihaDto extends PartialType(CreateLoyihaDto) {}
