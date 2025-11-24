import { Transform } from 'class-transformer';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class NearestQueryDto {
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return 1;
    }
    return parseInt(value, 10);
  })
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 1;
}

