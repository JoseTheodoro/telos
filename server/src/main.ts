import { createApp } from "./create-app.js";
import { loadEnv } from "./Infrastructure/Config/env.js";

const env = loadEnv(process.env);
const app = await createApp(env);
await app.listen({ port: env.PORT, host: env.HOST });
