import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/Infrastructure/Config/env.js";

describe("loadEnv", () => {
  it("applies defaults for optional variables", () => {
    const env = loadEnv({ NODE_ENV: "production" });

    expect(env).toMatchObject({ NODE_ENV: "production", PORT: 8080, HOST: "0.0.0.0" });
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
  });

  it("converts PORT to a number and accepts an OTLP endpoint", () => {
    const env = loadEnv({ NODE_ENV: "development", PORT: "3000", OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318" });

    expect(env.PORT).toBe(3000);
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("http://localhost:4318");
  });

  it("fails fast on invalid configuration, naming variables but never their values", () => {
    const rawEnv = { NODE_ENV: "synthetic-bad-env", PORT: "70000", OTEL_EXPORTER_OTLP_ENDPOINT: "synthetic-not-a-url" };

    const failure = (): Error => {
      try {
        loadEnv(rawEnv);
      } catch (error) {
        return error as Error;
      }
      throw new Error("loadEnv should have failed");
    };

    const message = failure().message;
    expect(message).toContain("NODE_ENV");
    expect(message).toContain("PORT");
    expect(message).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
    expect(message).not.toContain("synthetic-bad-env");
    expect(message).not.toContain("70000");
    expect(message).not.toContain("synthetic-not-a-url");
  });

  it("fails when NODE_ENV is missing", () => {
    expect(() => loadEnv({})).toThrowError(/NODE_ENV/);
  });
});
