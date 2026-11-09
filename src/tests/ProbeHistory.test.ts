import { describe, expect, it } from "vitest";
import { ProbeHistory } from "../runtime/ProbeHistory";

const range = (from: number, to: number) => Array.from({ length: to - from }, (v, i) => from + i);

describe("ProbeHistory", () => {
    it("reads back the most recent samples, oldest first", () => {
        const history = new ProbeHistory(8);
        history.push(range(1, 4));
        history.push(range(4, 7));
        expect(Array.from(history.read(new Float32Array(4)))).toEqual([3, 4, 5, 6]);
        expect(history.length).toBe(6);
    });

    it("wraps around without losing order", () => {
        const history = new ProbeHistory(5);
        history.push(range(0, 4));
        history.push(range(4, 9));
        expect(Array.from(history.read(new Float32Array(5)))).toEqual([4, 5, 6, 7, 8]);
        expect(history.length).toBe(5);
    });

    it("reads what was never written as silence, before the signal", () => {
        const history = new ProbeHistory(8);
        history.push([7, 8]);
        expect(Array.from(history.read(new Float32Array(4)))).toEqual([0, 0, 7, 8]);
    });

    it("refuses to read more than its capacity", () => {
        expect(() => new ProbeHistory(4).read(new Float32Array(5))).toThrow(RangeError);
    });

    it("forgets everything on clear", () => {
        const history = new ProbeHistory(4);
        history.push([1, 2, 3]);
        history.clear();
        expect(history.length).toBe(0);
        expect(Array.from(history.read(new Float32Array(2)))).toEqual([0, 0]);
    });
});
