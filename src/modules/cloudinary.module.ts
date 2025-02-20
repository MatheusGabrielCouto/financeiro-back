import { Module } from '@nestjs/common';
import { CloudinaryService } from 'src/services/cloudinary.service';

@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
