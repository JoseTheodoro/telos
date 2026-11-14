import "reflect-metadata";
import { plainToInstance, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from "class-validator";

const NODE_ENVIRONMENTS = ["development", "test", "production"] as const;

export class Env {
  @IsIn(NODE_ENVIRONMENTS)
  NODE_ENV: (typeof NODE_ENVIRONMENTS)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 8080;

  @IsString()
  HOST: string = "0.0.0.0";

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ["http", "https"] })
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
}

export function loadEnv(rawEnv: Record<string, string | undefined>): Env {
  const env = plainToInstance(Env, rawEnv, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const failures = errors.map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join("; ")}`);
    throw new Error(`Configuração inválida: ${failures.join(" | ")}`);
  }
  return env;
}
