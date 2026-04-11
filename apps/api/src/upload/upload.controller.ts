import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { PresignRequestDto } from './dto/presign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('admin/upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private service: UploadService) {}

  @Post('presign')
  presign(@Body() body: PresignRequestDto) {
    return this.service.generatePresignedUrl(body.fileName, body.contentType);
  }

  @Delete('*')
  deleteFile(@Param() params: Record<string, string>) {
    // The wildcard param captures everything after /admin/upload/
    const key = params[0] || params['0'];
    return this.service.deleteFile(key);
  }
}
