import { register } from "node:module";

let sdk: { shutdown(): Promise<void> } | undefined;

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const isDisabled = process.env.OTEL_SDK_DISABLED === "true";

if (endpoint && !isDisabled) {
  // Sem o hook ESM o import-in-the-middle não enxerga o fastify nem o http carregados via import.
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

  const [{ NodeSDK }, { OTLPTraceExporter }, { HttpInstrumentation }, { FastifyOtelInstrumentation }] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/instrumentation-http"),
    import("@fastify/otel"),
  ]);

  const nodeSdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "telos",
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [new HttpInstrumentation(), new FastifyOtelInstrumentation({ registerOnInitialization: true })],
  });
  nodeSdk.start();
  sdk = nodeSdk;
}
