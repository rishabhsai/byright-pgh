import { describe, expect, it } from "vitest";
import { clampWidth, fitWidths, layoutStyle, parseWidths } from "./paneLayout";

describe("pane layout", () => {
  it("parses stored widths and drops malformed or out-of-range values", () => {
    expect(parseWidths(null)).toEqual({ rail: null, panel: null });
    expect(parseWidths("not json")).toEqual({ rail: null, panel: null });
    expect(parseWidths('{"rail":400,"panel":500}')).toEqual({ rail: 400, panel: 500 });
    expect(parseWidths('{"rail":100,"panel":"500"}')).toEqual({ rail: null, panel: null });
    expect(parseWidths('{"rail":399.6,"panel":721}')).toEqual({ rail: 400, panel: null });
  });

  it("clamps each pane to its limits", () => {
    expect(clampWidth("rail", 10)).toBe(280);
    expect(clampWidth("rail", 9999)).toBe(520);
    expect(clampWidth("panel", 10)).toBe(340);
    expect(clampWidth("panel", 9999)).toBe(720);
  });

  it("keeps stored widths only while the map keeps 360px", () => {
    const both = { rail: 520, panel: 720 };
    expect(fitWidths(both, 1680)).toEqual(both);
    // 520 + 720 + 360 > 1440: the panel falls back to its 440px default.
    expect(fitWidths(both, 1440)).toEqual({ rail: 520, panel: null });
    // At 1280 the rail alone still fits (520 + 380 + 360).
    expect(fitWidths(both, 1280)).toEqual({ rail: 520, panel: null });
    expect(fitWidths({ rail: null, panel: 720 }, 1280)).toEqual({ rail: null, panel: null });
    expect(fitWidths({ rail: null, panel: 540 }, 1280)).toEqual({ rail: null, panel: 540 });
  });

  it("only sets variables for user-set widths", () => {
    expect(layoutStyle({ rail: null, panel: null })).toEqual({});
    expect(layoutStyle({ rail: 400, panel: null })).toEqual({ "--rail-w": "400px" });
  });
});
