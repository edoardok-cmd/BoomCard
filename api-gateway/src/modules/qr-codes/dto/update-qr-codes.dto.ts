import { PartialType } from '@nestjs/mapped-types';
import { CreateQrCodesDto } from './create-qr-codes.dto';

export class UpdateQrCodesDto extends PartialType(CreateQrCodesDto) {}