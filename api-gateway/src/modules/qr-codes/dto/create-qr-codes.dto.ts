import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateQrCodesDto {
  @IsString()
  name: string;
  
  @IsString()
  @IsOptional()
  description?: string;
}