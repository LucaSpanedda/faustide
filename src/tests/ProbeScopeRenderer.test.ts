import { describe, expect, it } from "vitest";
import { findRisingTrigger, formatScopeDuration, formatScopeValue, readScopeCursor, scopeHalfRange } from "../scope/probe/ProbeScopeRenderer";

describe("ProbeScopeRenderer", () => {
    it("finds the latest rising zero crossing that leaves a whole window", () => {
        // Crossings upwards at 2 and 6; a window of 3 still fits after 6
        const data = Float32Array.from([-1, -1, 1, 1, -1, -1, 1, 1, 1]);
        expect(findRisingTrigger(data, 3)).toBe(6);
        // A window of 4 does not fit after 6, so the crossing at 2
        expect(findRisingTrigger(data, 4)).toBe(2);
    });

    it("reports a signal that never crosses zero upwards", () => {
        expect(findRisingTrigger(Float32Array.from([1, 0.5, 0.2, 0.1]), 2)).toBe(-1);
    });

    it("scales to the peak in auto range, never to 0, and keeps a fixed range", () => {
        expect(scopeHalfRange(Float32Array.from([0.1, -0.4, 0.2]), "auto")).toBe(Float32Array.from([0.4])[0]);
        expect(scopeHalfRange(new Float32Array(4), "auto")).toBe(1);
        expect(scopeHalfRange(Float32Array.from([0.1, NaN, Infinity]), "auto")).toBe(Float32Array.from([0.1])[0]);
        expect(scopeHalfRange(Float32Array.from([5]), 1)).toBe(1);
    });

    it("formats values and durations compactly", () => {
        expect(formatScopeValue(0)).toBe("0");
        expect(formatScopeValue(0.5)).toBe("0.5");
        expect(formatScopeValue(-0.12345)).toBe("-0.123");
        expect(formatScopeValue(0.0001)).toBe("1.0e-4");
        expect(formatScopeDuration(0.02)).toBe("20 ms");
        expect(formatScopeDuration(1.5)).toBe("1.5 s");
    });

    it("reads one sample under the cursor when samples are fewer than columns", () => {
        const samples = Float32Array.from([0, 0.25, 0.5, 0.75, 1]);
        // 5 samples over 100 columns: column 50 is sample 2
        expect(readScopeCursor(samples, 100, 50, 1000)).toEqual({ time: 0.002, min: 0.5, max: 0.5 });
    });

    it("reads the span of a column when it holds several samples", () => {
        const samples = Float32Array.from([1, -1, 2, -2, 3, -3, 4, -4]);
        // 8 samples over 2 columns: the second holds 3, -3, 4, -4
        expect(readScopeCursor(samples, 2, 1.5, 8)).toEqual({ time: 0.5, min: -4, max: 4 });
    });
});
