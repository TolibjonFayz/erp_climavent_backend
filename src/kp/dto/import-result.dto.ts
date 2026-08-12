export class ImportResultDto {
  message: string;
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}
