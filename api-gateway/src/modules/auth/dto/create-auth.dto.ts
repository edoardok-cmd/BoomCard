import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateAuthDto {
  @IsString()
  name: string;
  
  @IsString()
  @IsOptional()
  description?: string;
}