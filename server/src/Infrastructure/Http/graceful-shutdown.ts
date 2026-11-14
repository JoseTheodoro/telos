import type { FastifyInstance } from "fastify";

export const SHUTDOWN_GRACE_MS = 10_000;
const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

// Sem o teto, uma conexão pendurada seguraria o SIGTERM até o orquestrador dar SIGKILL e perder o drain das demais.
export function closeLingeringConnectionsAfter(app: FastifyInstance, graceMs: number): void {
  let timer: NodeJS.Timeout | undefined;
  app.addHook("preClose", (done) => {
    timer = setTimeout(() => app.server.closeAllConnections(), graceMs);
    timer.unref();
    done();
  });
  app.addHook("onClose", (_instance, done) => {
    clearTimeout(timer);
    done();
  });
}

export function closeOnShutdownSignals(app: FastifyInstance): void {
  let isClosing = false;

  const shutDown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isClosing) return;
    isClosing = true;
    try {
      await app.close();
    } catch (error) {
      app.log.error({ err: error }, "Falha ao encerrar o servidor");
      process.exit(1);
    }
    for (const shutdownSignal of SHUTDOWN_SIGNALS) process.removeListener(shutdownSignal, onSignal);
    // Reenvia o sinal sem o listener para o processo terminar com o status do sinal, como o orquestrador espera.
    process.kill(process.pid, signal);
  };

  const onSignal = (signal: NodeJS.Signals): void => void shutDown(signal);
  for (const signal of SHUTDOWN_SIGNALS) process.on(signal, onSignal);
}
