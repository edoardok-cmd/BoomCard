import { Module } from '@nestjs/common';
import { QrCodesController } from './qr-codes.controller';
import { QrCodesService } from './qr-codes.service';
import { QrCodesRepository } from './qr-codes.repository';

@Module({
  controllers: [QrCodesController],
  providers: [QrCodesService, QrCodesRepository],
  exports: [QrCodesService]
})
export class QrCodesModule {}