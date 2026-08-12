import { PartialType } from '@nestjs/swagger';
import { CreateKpDto } from './create-kp.dto';

export class UpdateKpDto extends PartialType(CreateKpDto) {}
