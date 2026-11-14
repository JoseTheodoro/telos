const NODE_ENVIRONMENTS = ["development", "test", "production"] as const;
const DEFAULT_PORT = 8080;
const DEFAULT_HOST = "0.0.0.0";
const MAX_PORT = 65_535;

type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export interface Env {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  HOST: string;
  WEB_DIST_DIR?: string;
}

export function loadEnv(rawEnv: Record<string, string | undefined>): Env {
  const nodeEnv = rawEnv.NODE_ENV;
  const port = rawEnv.PORT === undefined ? DEFAULT_PORT : Number(rawEnv.PORT);
  const isPortValid = Number.isInteger(port) && port >= 1 && port <= MAX_PORT;

  if (!isNodeEnvironment(nodeEnv) || !isPortValid) {
    const failures = [
      ...(isNodeEnvironment(nodeEnv) ? [] : [`NODE_ENV: deve ser um de ${NODE_ENVIRONMENTS.join(", ")}`]),
      ...(isPortValid ? [] : [`PORT: deve ser um inteiro entre 1 e ${MAX_PORT}`]),
    ];
    throw new Error(`Configuração inválida: ${failures.join(" | ")}`);
  }

  return { NODE_ENV: nodeEnv, PORT: port, HOST: rawEnv.HOST ?? DEFAULT_HOST, WEB_DIST_DIR: rawEnv.WEB_DIST_DIR };
}

function isNodeEnvironment(value: string | undefined): value is NodeEnvironment {
  return NODE_ENVIRONMENTS.some((environment) => environment === value);
}
