import { describe, expect, it } from "vitest";
import { phaseHalfRange, readPhaseCursor } from "../scope/probe/ProbePhaseRenderer";
import {
    frequencyAtPosition,
    magnitudeBetween,
    positionOfFrequency,
    spectrogramColor,
    spectrumPeak
} from "../scope/probe/ProbeSpectrumRenderer";

describe("ProbePhaseRenderer", () => {
    it("scales to the peak of both signals in auto range, never to 0", () => {
        expect(phaseHalfRange(Float32Array.from([0.25, -0.5]), Float32Array.from([0.75]), "auto")).toBe(0.75);
        expect(phaseHalfRange(new Float32Array(2), new Float32Array(2), "auto")).toBe(1);
        expect(phaseHalfRange(Float32Array.from([5]), Float32Array.from([5]), 0.5)).toBe(0.5);
    });

    it("reads the signal values in the square centred in the canvas", () => {
        // 200 x 100 canvas: the square is 100 wide, from x = 50
        expect(readPhaseCursor(100, 50, 200, 100, 1)).toEqual({ x: 0, y: 0 });
        expect(readPhaseCursor(150, 0, 200, 100, 2)).toEqual({ x: 2, y: 2 });
        expect(readPhaseCursor(50, 100, 200, 100, 2)).toEqual({ x: -2, y: -2 });
    });
});

describe("ProbeSpectrumRenderer", () => {
    it("maps positions and frequencies on a log axis from 20 Hz to Nyquist", () => {
        expect(frequencyAtPosition(0, 48000)).toBeCloseTo(20, 10);
        expect(frequencyAtPosition(1, 48000)).toBeCloseTo(24000, 6);
        expect(positionOfFrequency(frequencyAtPosition(0.37, 48000), 48000)).toBeCloseTo(0.37, 10);
    });

    it("reads the highest bin between two frequencies, or the nearest one", () => {
        // 8 bins up to 8 Hz (sample rate 16): one bin per Hz
        const magnitudes = Float32Array.from([-90, -80, -10, -70, -60, -50, -40, -30]);
        expect(magnitudeBetween(magnitudes, 1, 3, 16)).toBe(-10);
        expect(magnitudeBetween(magnitudes, 4.2, 4.3, 16)).toBe(-60);
    });

    it("finds the peak above 20 Hz", () => {
        // 1000 bins up to 1000 Hz: bin n is n Hz; a louder bin below 20 Hz is ignored
        const magnitudes = new Float32Array(1000).fill(-100);
        magnitudes[5] = 0;
        magnitudes[440] = -6;
        expect(spectrumPeak(magnitudes, 2000)).toEqual({ frequency: 440, db: -6 });
    });

    it("colours magnitudes as the Plot spectrogram, nothing at or below the floor", () => {
        expect(spectrogramColor(-100, -100)).toBeUndefined();
        expect(spectrogramColor(-Infinity, -100)).toBeUndefined();
        expect(spectrogramColor(0, -100)).toBe("hsl(60, 100%, 50%)");
        expect(spectrogramColor(-50, -100)).toBe("hsl(330, 100%, 25%)");
    });
});
