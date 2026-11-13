import { describe, expect, it } from "vitest";
import { px, svgNumber } from "./dom";

const injected = '1px"><img src=x onerror=alert(1)>' as unknown as number;

describe("px", () => {
  it("px formats finite numbers", () => {
    expect(px(12.5)).toBe("12.5px");
    expect(px(-3)).toBe("-3px");
  });

  it("px rejects non-finite and non-number values", () => {
    for (const value of [Number.NaN, Infinity, -Infinity, injected]) expect(() => px(value)).toThrow(TypeError);
  });
});

describe("svgNumber", () => {
  it("svgNumber formats finite numbers", () => {
    expect(svgNumber(0)).toBe("0");
    expect(svgNumber(120.25)).toBe("120.25");
  });

  it("svgNumber rejects non-finite and non-number values", () => {
    for (const value of [Number.NaN, Infinity, injected]) expect(() => svgNumber(value)).toThrow(TypeError);
  });
});
