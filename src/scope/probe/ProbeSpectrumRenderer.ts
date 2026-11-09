import { drawCanvasBackground } from "../CanvasDrawing";
import { formatFrequency } from "../FrequencyScale";

/**
 * Spectrum and spectrogram drawing for fft and spectrogram probes.
 *
 * Both use a logarithmic frequency axis from 20 Hz to Nyquist and magnitudes
 * in dB from a floor (bottom, or no colour) to 0 dB (top, or brightest). The
 * spectrogram colours are those of the Plot tab's spectrogram. Pure functions
 * over a canvas context and magnitude arrays (one value per FFT bin, from 0 Hz
 * to Nyquist).
 */

/** Lowest frequency drawn, in Hz. */
export const SPECTRUM_MIN_FREQUENCY = 20;

/**
 * Returns the frequency at a position along a logarithmic axis.
 *
 * @param position 0 at 20 Hz, 1 at Nyquist
 * @param sampleRate the sample rate
 */
export const frequencyAtPosition = (position: number, sampleRate: number) =>
    SPECTRUM_MIN_FREQUENCY * (sampleRate / 2 / SPECTRUM_MIN_FREQUENCY) ** position;

/** Returns the position (0 at 20 Hz, 1 at Nyquist) of a frequency. */
export const positionOfFrequency = (frequency: number, sampleRate: number) =>
    Math.log(frequency / SPECTRUM_MIN_FREQUENCY) / Math.log(sampleRate / 2 / SPECTRUM_MIN_FREQUENCY);

/**
 * Returns the highest magnitude between two frequencies, or at the nearest
 * bin when they fall within one bin.
 *
 * @param magnitudes dB per bin, from 0 Hz to Nyquist
 * @param from lower frequency in Hz
 * @param to higher frequency in Hz
 * @param sampleRate the sample rate
 */
export const magnitudeBetween = (magnitudes: Float32Array, from: number, to: number, sampleRate: number) => {
    const binsPerHz = magnitudes.length / (sampleRate / 2);
    const first = Math.max(0, Math.min(magnitudes.length - 1, Math.round(from * binsPerHz)));
    const last = Math.max(first, Math.min(magnitudes.length - 1, Math.round(to * binsPerHz)));
    let max = magnitudes[first];
    for (let bin = first + 1; bin <= last; bin++) if (magnitudes[bin] > max) max = magnitudes[bin];
    return max;
};

/** Returns the frequency and magnitude of the highest bin above 20 Hz. */
export const spectrumPeak = (magnitudes: Float32Array, sampleRate: number) => {
    const hzPerBin = sampleRate / 2 / magnitudes.length;
    let peak = Math.max(1, Math.ceil(SPECTRUM_MIN_FREQUENCY / hzPerBin));
    for (let bin = peak + 1; bin < magnitudes.length; bin++) if (magnitudes[bin] > magnitudes[peak]) peak = bin;
    return { frequency: peak * hzPerBin, db: magnitudes[peak] };
};

/**
 * Returns the colour of a magnitude in the spectrogram, as in the Plot tab,
 * or undefined at or below the floor.
 *
 * @param db the magnitude
 * @param floor the magnitude drawn black, below 0 dB
 */
export const spectrogramColor = (db: number, floor: number) => {
    const normalized = Math.min(1, Math.max(0, (db - floor) / -floor));
    if (!(normalized > 0)) return undefined;
    return `hsl(${(normalized * 180 + 240) % 360}, 100%, ${normalized * 50}%)`;
};

/** Formats a magnitude in dB. */
const formatDb = (db: number) => (Number.isFinite(db) ? `${db.toFixed(1)} dB` : "-∞ dB");

/** Draws the decade lines (100 Hz, 1 kHz, 10 kHz) of a horizontal log axis, labelled. */
const drawFrequencyGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, sampleRate: number, pixelRatio: number) => {
    ctx.save();
    ctx.lineWidth = pixelRatio;
    ctx.font = `${10 * pixelRatio}px monospace`;
    ctx.fillStyle = "#909090";
    ctx.textBaseline = "bottom";
    for (let frequency = 100; frequency < sampleRate / 2; frequency *= 10) {
        const x = Math.round(positionOfFrequency(frequency, sampleRate) * width) + 0.5;
        ctx.strokeStyle = "#303030";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.fillText(formatFrequency(frequency), x + 3 * pixelRatio, height - 3 * pixelRatio);
    }
    ctx.restore();
};

/**
 * Draws one spectrum: magnitude in dB against log frequency, with the peak
 * and, under the mouse, the frequency and magnitude there.
 *
 * @param ctx the canvas context
 * @param width canvas width in device pixels
 * @param height canvas height in device pixels
 * @param magnitudes dB per bin, from 0 Hz to Nyquist
 * @param sampleRate the sample rate
 * @param floor the magnitude at the bottom edge, below 0 dB
 * @param caption text written in the bottom-right corner
 * @param options pixel ratio and cursor position in device pixels
 */
export const drawProbeSpectrum = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    magnitudes: Float32Array,
    sampleRate: number,
    floor: number,
    caption: string,
    options: { pixelRatio?: number; cursorX?: number } = {}
) => {
    const { pixelRatio = 1, cursorX } = options;
    drawCanvasBackground(ctx, width, height, "#000000");
    // dB lines every 20 dB
    ctx.save();
    ctx.lineWidth = pixelRatio;
    ctx.strokeStyle = "#303030";
    ctx.beginPath();
    for (let db = -20; db > floor; db -= 20) {
        const y = Math.round(height * db / floor) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
    drawFrequencyGrid(ctx, width, height, sampleRate, pixelRatio);

    const toY = (db: number) => (Number.isFinite(db) ? Math.min(height, Math.max(0, height * db / floor)) : height);
    if (magnitudes.length) {
        ctx.save();
        ctx.strokeStyle = "#FFFFFF";
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1.5 * pixelRatio;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x < width; x++) {
            const from = frequencyAtPosition(x / width, sampleRate);
            const to = frequencyAtPosition((x + 1) / width, sampleRate);
            ctx.lineTo(x, toY(magnitudeBetween(magnitudes, from, to, sampleRate)));
        }
        ctx.lineTo(width, height);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Floor, peak and caption
    ctx.save();
    ctx.font = `${10 * pixelRatio}px monospace`;
    ctx.fillStyle = "#909090";
    ctx.textBaseline = "top";
    ctx.fillText("0 dB", 4 * pixelRatio, 3 * pixelRatio);
    if (magnitudes.length) {
        const peak = spectrumPeak(magnitudes, sampleRate);
        ctx.textAlign = "right";
        ctx.fillText(`peak ${formatFrequency(peak.frequency)} Hz · ${formatDb(peak.db)}`, width - 4 * pixelRatio, 3 * pixelRatio);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(caption, width - 4 * pixelRatio, height - 14 * pixelRatio);
    ctx.restore();

    if (cursorX === undefined || !magnitudes.length) return;
    const frequency = frequencyAtPosition(cursorX / width, sampleRate);
    const db = magnitudeBetween(magnitudes, frequency, frequencyAtPosition((cursorX + 1) / width, sampleRate), sampleRate);
    drawVerticalCursor(ctx, width, height, cursorX, [`${formatFrequency(frequency)} Hz`, formatDb(db)], pixelRatio);
};

/**
 * Draws a vertical dashed line at the cursor and up to two lines of text
 * beside it, on the side with more room, as the scope probe does.
 */
export const drawVerticalCursor = (ctx: CanvasRenderingContext2D, width: number, height: number, cursorX: number, lines: string[], pixelRatio: number) => {
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
    const right = cursorX < width / 2;
    ctx.textAlign = right ? "left" : "right";
    const labelX = cursorX + (right ? 5 : -5) * pixelRatio;
    lines.forEach((line, i) => ctx.fillText(line, labelX, (3 + 13 * i) * pixelRatio));
    ctx.restore();
};
