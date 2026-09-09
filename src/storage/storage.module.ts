import { Global, Module } from '@nestjs/common';
import { R2Service } from './r2.service';

// Global — fayl saqlash boshqa modullarga ham kerak bo'lishi mumkin
@Global()
@Module({
  providers: [R2Service],
  exports: [R2Service],
})
export class StorageModule {}
