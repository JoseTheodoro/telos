import { trace, type ProxyTracerProvider } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";

describe("instrumentation", () => {
  it("starts nothing and does not throw without OTEL_EXPORTER_OTLP_ENDPOINT", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");

    await expect(import("../src/Infrastructure/Observability/instrumentation.js")).resolves.toBeDefined();

    const provider = trace.getTracerProvider() as ProxyTracerProvider;
    expect(provider.getDelegate().constructor.name).toBe("NoopTracerProvider");
    vi.unstubAllEnvs();
  });
});
