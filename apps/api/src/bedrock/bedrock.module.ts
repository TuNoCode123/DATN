import { Module, Global } from '@nestjs/common';
import { BedrockService } from './bedrock.service';

@Global()
@Module({
  providers: [BedrockService],
  exports: [BedrockService],
})
export class BedrockModule {}
