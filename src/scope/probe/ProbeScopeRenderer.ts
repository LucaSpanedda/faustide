import { drawCanvasBackground } from "../CanvasDrawing";

/**
 * Oscilloscope drawing for scope probes.
 *
 * Pure functions over a canvas context and a window of samples: the panel
 * decides which samples (history, trigger, freeze) and when to redraw (its
 * refresh rate). When the window holds more samples than the canvas has
 * columns, each column draws the minimum and maximum of its samples, so peaks
 * stay visible at any zoom, as Max's `scope~` does.
 */

export type ProbeScopeRange = "auto" | number;

/**
 * Finds where a triggered window starts: the latest rising zero crossing
 * that still leaves a whole window after it.
 *
 * @param data the recent signal, oldest first, longer than the window
 * @param windowLength the number of samples drawn
 * @returns the start index of the window, or -1 if the signal never crosses
 * zero upwards in the searchable part
 */
export const findRisingTrigger = (data: Float32Array, windowLength: number) => {
    for (let i = data.length - windowLength; i > 0; i--) {
        if (data[i - 1] < 0 && data[i] >= 0) return i;
    }
    return -1;
};

/**
 * Returns the half-height of the drawn range: the fixed one, or for "auto"
 * the peak of the window, never 0.
 */
export const scopeHalfRange = (samples: Float32Array, range: ProbeScopeRange) => {
    if (range !== "auto") return range;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const magnitude = Math.abs(samples[i]);
        if (magnitude > peak && Number.isFinite(magnitude)) peak = magnitude;
    }
    return peak > 0 ? peak : 1;
};

/** Formats a range bound compactly: 0.5, 0.0123, 1.2e+3. */
export const formatScopeValue = (value: number) => {
    if (value === 0) return "0";
    const magnitude = Math.abs(value);
    if (magnitude >= 1000 || magnitude < 0.001) return value.toExponential(1);
    return value.toPrecision(3).replace(/\.?0+$/, "");
};

/** Formats a window duration: 5 ms, 1.5 s. */
export const formatScopeDuration = (seconds: number) => (seconds < 1 ? `${+(seconds * 1000).toPrecision(3)} ms` : `${+seconds.toPrecision(3)} s`);

export type ProbeScopeDrawOptions = {
    /** Device pixels per CSS pixel, for line and text sizes */
    pixelRatio?: number;
    /** Horizontal position of the mouse in device pixels, to read the value there */
    cursorX?: number;
    /** Sample rate, to give the cursor's time */
    sampleRate?: number;
};

/**
 * Returns what the cursor reads at a column: the time of the column from the
 * window start, and the value there, or the minimum and maximum when the
 * column spans several samples.
 *
 * @param samples the drawn window
 * @param width canvas width in device pixels
 * @param x the column, in device pixels
 * @param sampleRate the sample rate
 */
export const readScopeCursor = (samples: Float32Array, width: number, x: number, sampleRate: number) => {
    const { length } = samples;
    if (length <= width) {
        const index = Math.min(length - 1, Math.max(0, Math.round((x / width) * (length - 1))));
        return { time: index / sampleRate, min: samples[index], max: samples[index] };
    }
    const column = Math.min(width - 1, Math.max(0, Math.floor(x)));
    const from = Math.floor((column * length) / width);
    const to = Math.max(from + 1, Math.floor(((column + 1) * length) / width));
    let min = samples[from];
    let max = samples[from];
    for (let i = from + 1; i < to; i++) {
        if (samples[i] < min) min = samples[i];
        else if (samples[i] > max) max = samples[i];
    }
    return { time: from / sampleRate, min, max };
};

/**
 * Draws one scope frame.
 *
 * @param ctx the canvas context
 * @param width canvas width in device pixels
 * @param height canvas height in device pixels
 * @param samples the window to draw, oldest first
 * @param halfRange the value drawn at the top edge (and its opposite at the bottom)
 * @param caption text written in the bottom-right corner (window, state)
 * @param options pixel ratio and cursor
 */
export const drawProbeScope = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    samples: Float32Array,
    halfRange: number,
    caption: string,
    options: ProbeScopeDrawOptions = {}
) => {
    const { pixelRatio = 1, cursorX, sampleRate } = options;
    drawCanvasBackground(ctx, width, height, "#000000");
    // Grid: centre line stronger than the quarters
    ctx.save();
    ctx.lineWidth = pixelRatio;
    ctx.strokeStyle = "#303030";
    ctx.beginPath();
    for (let ratio = 0.25; ratio < 1; ratio += 0.25) {
        ctx.moveTo(Math.round(width * ratio) + 0.5, 0);
        ctx.lineTo(Math.round(width * ratio) + 0.5, height);
        if (ratio !== 0.5) {
            ctx.moveTo(0, Math.round(height * ratio) + 0.5);
            ctx.lineTo(width, Math.round(height * ratio) + 0.5);
        }
    }
    ctx.stroke();
    ctx.strokeStyle = "#505050";
    ctx.beginPath();
    ctx.moveTo(0, Math.round(height / 2) + 0.5);
    ctx.lineTo(width, Math.round(height / 2) + 0.5);
    ctx.stroke();
    ctx.restore();

    const length = samples.length;
    if (length) {
        // Values outside the range are clipped to the edges
        const toY = (value: number) => {
            const y = height / 2 - (value / halfRange) * (height / 2);
            return Number.isFinite(y) ? Math.min(height, Math.max(0, y)) : height / 2;
        };
        ctx.save();
        ctx.strokeStyle = "#FFFFFF";
        ctx.fillStyle = "#FFFFFF";
        ctx.lineWidth = 1.5 * pixelRatio;
        ctx.lineJoin = "round";
        if (length <= width) {
            // Fewer samples than columns: a line through the samples
            ctx.beginPath();
            const step = length > 1 ? width / (length - 1) : 0;
            for (let i = 0; i < length; i++) {
                const x = i * step;
                if (i === 0) ctx.moveTo(x, toY(samples[i]));
                else ctx.lineTo(x, toY(samples[i]));
            }
            ctx.stroke();
        } else {
            // More samples than columns: the min-max span of each column
            for (let column = 0; column < width; column++) {
                const from = Math.floor((column * length) / width);
                const to = Math.max(from + 1, Math.floor(((column + 1) * length) / width));
                let min = samples[from];
                let max = samples[from];
                for (let i = from + 1; i < to; i++) {
                    if (samples[i] < min) min = samples[i];
                    else if (samples[i] > max) max = samples[i];
                }
                const top = toY(max);
                const bottom = toY(min);
                ctx.fillRect(column, top, 1, Math.max(pixelRatio, bottom - top));
            }
        }
        ctx.restore();
    }

    // Range bounds on the left, caption on the right
    ctx.save();
    ctx.font = `${10 * pixelRatio}px monospace`;
    ctx.fillStyle = "#909090";
    ctx.textBaseline = "top";
    ctx.fillText(`+${formatScopeValue(halfRange)}`, 4 * pixelRatio, 3 * pixelRatio);
    ctx.textBaseline = "bottom";
    ctx.fillText(`-${formatScopeValue(halfRange)}`, 4 * pixelRatio, height - 3 * pixelRatio);
    ctx.textAlign = "right";
    ctx.fillText(caption, width - 4 * pixelRatio, height - 3 * pixelRatio);
    ctx.restore();

    // Cursor: a vertical line and the value under it, as in the real-time scope
    if (cursorX === undefined || !samples.length || !sampleRate) return;
    const { time, min, max } = readScopeCursor(samples, width, cursorX, sampleRate);
    const value = min === max ? formatScopeValue(min) : `${formatScopeValue(min)} … ${formatScopeValue(max)}`;
    ctx.save();
    ctx.strokeStyle = "#ffffa0";
    ctx.lineWidth = pixelRatio;
    ctx.setLineDash([2 * pixelRatio, 2 * pixelRatio]);
    ctx.beginPath();
    ctx.moveTo(Math.round(cursorX) + 0.5, 0);
    ctx.lineTo(Math.round(cursorX) + 0.5, height);
    ctx.stroke();
    ctx.font = `${11 * pixelRatio}px monospace`;
    ctx.fillStyle = "#ffffa0";
    ctx.textBaseline = "top";
    // The label stays inside the canvas, on the side with more room
    const right = cursorX < width / 2;
    ctx.textAlign = right ? "left" : "right";
    const labelX = cursorX + (right ? 5 : -5) * pixelRatio;
    ctx.fillText(value, labelX, 3 * pixelRatio);
    ctx.fillText(formatScopeDuration(time), labelX, 16 * pixelRatio);
    ctx.restore();
};
