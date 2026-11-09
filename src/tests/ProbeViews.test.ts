import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProbeHistory } from "../runtime/ProbeHistory";
import type { ProbeDescriptor, ProbeKind } from "../runtime/ProbeModel";
import { createProbeView } from "../scope/probe/createProbeView";
import { numberStatistics } from "../scope/probe/ProbeNumberView";
import { ProbeRecView, recordingFileName } from "../scope/probe/ProbeRecView";
import { installMockCanvasContext } from "./helpers/canvasContext";

const SAMPLE_RATE = 48000;

/** Builds a view of a kind, with its own histories filled with `fill`. */
const makeView = (kind: ProbeKind, fill?: (i: number) => number, channels = kind === "phase" ? 2 : 1) => {
    const probe: ProbeDescriptor = { key: `/main/${kind}_1`, kind, label: `${kind} 1`, channels: Array.from({ length: channels }, (v, i) => i) };
    const histories = probe.channels.map(() => new ProbeHistory(4 * SAMPLE_RATE));
    if (fill) histories.forEach(history => history.push(Float32Array.from({ length: SAMPLE_RATE }, (v, i) => fill(i))));
    const onProbingChange = vi.fn();
    const view = createProbeView({ probe, histories, sampleRate: SAMPLE_RATE, save: vi.fn(), getFileName: () => "main.dsp", onProbingChange });
    document.body.append(view.element);
    return { view, histories, onProbingChange };
};

describe("probe views", () => {
    let canvases: ReturnType<typeof installMockCanvasContext>;
    const lastDrawingOf = (canvas: HTMLCanvasElement) => canvases.contexts.filter(context => context.canvas === canvas).pop();
    const texts = (canvas: HTMLCanvasElement) => vi.mocked(lastDrawingOf(canvas).fillText).mock.calls.map(call => call[0]);

    beforeEach(() => {
        canvases = installMockCanvasContext();
    });

    afterEach(() => {
        canvases.restore();
    });

    it("builds the view of each kind, with its own controls", () => {
        const controls = (kind: ProbeKind) => Array.from(makeView(kind).view.element.querySelectorAll(".probe-view-header > :not(.probe-name)")).map(control => Array.from(control.classList).find(name => name.startsWith("probe-")));
        expect(controls("scope")).toEqual(["probe-window", "probe-range", "probe-trigger", "probe-rate", "probe-freeze"]);
        expect(controls("phase")).toEqual(["probe-window", "probe-range", "probe-rate", "probe-freeze"]);
        expect(controls("fft")).toEqual(["probe-size", "probe-floor", "probe-rate", "probe-freeze"]);
        expect(controls("spectrogram")).toEqual(["probe-size", "probe-floor", "probe-rate", "probe-freeze"]);
        expect(controls("number")).toEqual(["probe-window", "probe-rate", "probe-freeze"]);
        expect(controls("rec")).toEqual(["probe-record"]);
    });

    it("finds the frequency of a sine in the spectrum", () => {
        const { view } = makeView("fft", i => Math.sin(2 * Math.PI * 1000 * i / SAMPLE_RATE));
        view.tick(1000);
        const peak = texts(view.canvas).find(text => text.startsWith("peak"));
        // 4096-point FFT at 48 kHz: bins are 11.7 Hz apart
        expect(peak).toMatch(/^peak (99\d|100\d|101\d) Hz · -?\d/);
    });

    it("adds a spectrogram column per redraw", () => {
        const { view } = makeView("spectrogram", i => Math.sin(i / 10));
        view.canvas.width = 40;
        view.canvas.height = 20;
        view.tick(1000);
        // The off-screen image took the canvas size and got its first column
        const image = canvases.contexts.find(context => context.canvas !== view.canvas && context.canvas.width === 40);
        expect(image).toBeDefined();
        expect(image.drawImage).toHaveBeenCalled();
    });

    it("draws a phase portrait from its two signals, and reads x and y under the mouse", () => {
        const { view } = makeView("phase", i => Math.sin(i / 100));
        view.tick(1000);
        view.canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));
        expect(texts(view.canvas).some(text => text.startsWith("x "))).toBe(true);
        expect(texts(view.canvas).some(text => text.startsWith("y "))).toBe(true);
    });

    it("computes the statistics of a number", () => {
        expect(numberStatistics(Float32Array.from([1, -3, 2]))).toEqual({ value: 2, min: -3, max: 2, mean: 0, rms: Math.sqrt(14 / 3) });
        expect(numberStatistics(new Float32Array(0))).toEqual({ value: 0, min: 0, max: 0, mean: 0, rms: 0 });
    });

    it("shows the current value of a number with its statistics", () => {
        const { view } = makeView("number", () => 0.25);
        view.tick(1000);
        expect(texts(view.canvas)).toContain("0.250000");
        expect(texts(view.canvas)).toContain("min 0.25 · max 0.25");
    });

    describe("recorder", () => {
        it("names files after the DSP file, the probe and the time, without unsafe characters", () => {
            expect(recordingFileName("my dsp.dsp", "loop / out", new Date(2026, 10, 9, 8, 5, 3))).toBe("my_dsp-loop_out-20261109-080503.wav");
        });

        it("needs the probes only while recording, and receives every block meanwhile", async () => {
            const { view, onProbingChange } = makeView("rec");
            const rec = view as ProbeRecView;
            const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
            expect(rec.needsProbing).toBe(false);

            view.canvas.dispatchEvent(new MouseEvent("click"));
            expect(rec.needsProbing).toBe(true);
            expect(onProbingChange).toHaveBeenCalledTimes(1);
            rec.receive([new Float32Array(128).fill(0.5)], 0);
            rec.receive([new Float32Array(128).fill(0.5)], 1);

            const fileName = await rec.stop();
            expect(rec.needsProbing).toBe(false);
            expect(onProbingChange).toHaveBeenCalledTimes(2);
            expect(fileName).toMatch(/^main-rec_1-\d{8}-\d{6}\.wav$/);
            expect(click).toHaveBeenCalledTimes(1);
        });

        it("downloads nothing when nothing was recorded", async () => {
            const rec = makeView("rec").view as ProbeRecView;
            const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
            rec.start();
            expect(await rec.stop()).toBeUndefined();
            expect(click).not.toHaveBeenCalled();
        });
    });
});
