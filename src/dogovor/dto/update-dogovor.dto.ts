import { PartialType } from '@nestjs/swagger';
import { CreateDogovorDto } from './create-dogovor.dto';

export class UpdateDogovorDto extends PartialType(CreateDogovorDto) {}
