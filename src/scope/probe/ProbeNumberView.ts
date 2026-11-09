import { drawCanvasBackground } from "../CanvasDrawing";
import { formatScopeDuration, formatScopeValue } from "./ProbeScopeRenderer";
import { ProbeView } from "./ProbeView";
import type { ProbeViewOptions, ProbeViewSettings } from "./ProbeView";

/**
 * Number view (`pr.number`): the current value of the signal in large type,
 * with its minimum, maximum, mean and RMS over a window.
 */

export type NumberSettings = ProbeViewSettings & {
    /** Window of the statistics, in seconds */
    window: number;
};

export const NUMBER_WINDOWS = [0.01, 0.05, 0.1, 0.5, 1, 2];

/** Statistics of a window of samples: the last value, minimum, maximum, mean and RMS. */
export const numberStatistics = (samples: Float32Array) => {
    if (!samples.length) return { value: 0, min: 0, max: 0, mean: 0, rms: 0 };
    let min = samples[0];
    let max = samples[0];
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
        sum += sample;
        squares += sample * sample;
    }
    return { value: samples[samples.length - 1], min, max, mean: sum / samples.length, rms: Math.sqrt(squares / samples.length) };
};

export class ProbeNumberView extends ProbeView<NumberSettings> {
    private statistics = numberStatistics(new Float32Array(0));

    constructor(options: ProbeViewOptions) {
        super(options, { window: 0.5, rate: 10 });
    }

    protected get rates() {
        return [1, 2, 5, 10, 15, 30];
    }

    protected createControls() {
        const { settings } = this;
        return [
            this.createSelect("probe-window", "Window of min, max, mean and RMS", NUMBER_WINDOWS, settings.window, formatScopeDuration, (value) => {
                settings.window = value;
                this.redraw();
            })
        ];
    }

    protected read() {
        const length = Math.max(1, Math.round(this.settings.window * this.sampleRate));
        this.statistics = numberStatistics(this.histories[0].read(new Float32Array(length)));
    }

    protected paint(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number) {
        const { value, min, max, mean, rms } = this.statistics;
        drawCanvasBackground(ctx, width, height, "#000000");
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `${Math.round(Math.min(height * 0.32, width / 7))}px monospace`;
        ctx.fillText(Number.isFinite(value) ? value.toPrecision(6) : String(value), width / 2, height * 0.42);
        ctx.fillStyle = "#909090";
        ctx.font = `${11 * pixelRatio}px monospace`;
        ctx.fillText(`min ${formatScopeValue(min)} · max ${formatScopeValue(max)}`, width / 2, height * 0.72);
        ctx.fillText(`mean ${formatScopeValue(mean)} · rms ${formatScopeValue(rms)}`, width / 2, height * 0.72 + 14 * pixelRatio);
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${formatScopeDuration(this.settings.window)}${this.frozen ? " · frozen" : ""}`, width - 4 * pixelRatio, height - 3 * pixelRatio);
        ctx.restore();
    }
}
