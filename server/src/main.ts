import { createApp } from "./app.js";
import { loadEnv } from "./Infrastructure/Config/env.js";
import { closeOnShutdownSignals } from "./Infrastructure/Http/graceful-shutdown.js";

const env = loadEnv(process.env);
const app = createApp(env);
closeOnShutdownSignals(app);
await app.listen({ port: env.PORT, host: env.HOST });
