import { createApp } from "./create-app.js";
import { loadEnv } from "./Infrastructure/Config/env.js";
import { shutdownTelemetry } from "./Infrastructure/Observability/instrumentation.js";

const env = loadEnv(process.env);
const app = await createApp(env, { shutdownTelemetry });
await app.listen({ port: env.PORT, host: env.HOST });
