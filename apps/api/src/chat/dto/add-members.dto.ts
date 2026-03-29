import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class AddMembersDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  userIds: string[];
}
