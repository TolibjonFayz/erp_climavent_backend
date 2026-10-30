import { IsOptional, IsString } from 'class-validator';

// GET /activity?user_id=5&module=kp&action=create,update&ok=false&from=2026-10-01&to=2026-10-30&search=..&limit=50&offset=0
export class QueryActivityDto {
  @IsOptional() @IsString() user_id?: string;
  @IsOptional() @IsString() module?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() ok?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() limit?: string;
  @IsOptional() @IsString() offset?: string;
}
