import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/Infrastructure/Config/env.js";

describe("loadEnv", () => {
  it("applies defaults for optional variables", () => {
    const env = loadEnv({ NODE_ENV: "production" });

    expect(env).toMatchObject({ NODE_ENV: "production", PORT: 8080, HOST: "0.0.0.0" });
    expect(env.WEB_DIST_DIR).toBeUndefined();
  });

  it("converts PORT to a number and keeps HOST and WEB_DIST_DIR", () => {
    const env = loadEnv({ NODE_ENV: "development", PORT: "3000", HOST: "127.0.0.1", WEB_DIST_DIR: "/srv/web" });

    expect(env).toEqual({ NODE_ENV: "development", PORT: 3000, HOST: "127.0.0.1", WEB_DIST_DIR: "/srv/web" });
  });

  it("fails fast on invalid configuration, naming variables but never their values", () => {
    const rawEnv = { NODE_ENV: "synthetic-bad-env", PORT: "70000" };

    const failure = (): Error => {
      try {
        loadEnv(rawEnv);
      } catch (error) {
        return error as Error;
      }
      throw new Error("loadEnv should have failed");
    };

    const message = failure().message;
    expect(message).toMatch(/^Configuração inválida: /);
    expect(message).toContain("NODE_ENV");
    expect(message).toContain("PORT");
    expect(message).not.toContain("synthetic-bad-env");
    expect(message).not.toContain("70000");
  });

  it.each(["0", "3000.5", "synthetic-port", ""])("rejects PORT %j", (port) => {
    expect(() => loadEnv({ NODE_ENV: "test", PORT: port })).toThrowError(/PORT/);
  });

  it("fails when NODE_ENV is missing", () => {
    expect(() => loadEnv({})).toThrowError(/NODE_ENV/);
  });
});
