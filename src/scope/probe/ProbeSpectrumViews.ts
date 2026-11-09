import { FFTR } from "kissfft-js";
import { formatFrequency } from "../FrequencyScale";
import { getFrequencyDomainFrame } from "../../utils";
import {
    drawProbeSpectrum,
    drawVerticalCursor,
    frequencyAtPosition,
    magnitudeBetween,
    positionOfFrequency,
    spectrogramColor
} from "./ProbeSpectrumRenderer";
import { ProbeView } from "./ProbeView";
import type { ProbeViewOptions, ProbeViewSettings } from "./ProbeView";

/**
 * Frequency views: spectrum (`pr.fft`) and spectrogram (`pr.spectrogram`).
 *
 * Both compute, when they redraw, one Blackman-windowed FFT of the latest
 * samples (the IDE's own `getFrequencyDomainFrame`), so their cost follows
 * the redraw rate, not the sample rate.
 */

export type SpectrumSettings = ProbeViewSettings & {
    /** FFT size in samples */
    size: number;
    /** Magnitude at the bottom (spectrum) or drawn black (spectrogram), in dB */
    floor: number;
};

export const FFT_SIZES = [512, 1024, 2048, 4096, 8192, 16384];
export const SPECTRUM_FLOORS = [-60, -80, -100, -120];

/** Shared part of the two frequency views: the FFT of the latest samples. */
abstract class ProbeFrequencyView extends ProbeView<SpectrumSettings> {
    protected magnitudes: Float32Array = new Float32Array(0);
    private fft: FFTR | null = null;
    private fftSize = 0;

    protected createControls() {
        const { settings } = this;
        return [
            this.createSelect("probe-size", "FFT size", FFT_SIZES, settings.size, value => `${value}`, (value) => {
                settings.size = value;
                this.redraw();
            }),
            this.createSelect("probe-floor", "Floor", SPECTRUM_FLOORS, settings.floor, value => `${value} dB`, (value) => {
                settings.floor = value;
                this.redraw();
            })
        ];
    }

    /** Computes the magnitudes of the latest `size` samples. */
    protected computeSpectrum() {
        const { size } = this.settings;
        if (!this.fft || this.fftSize !== size) {
            this.fft?.dispose();
            this.fft = new FFTR(size);
            this.fftSize = size;
        }
        const samples = this.histories[0].read(new Float32Array(Math.min(size, this.histories[0].capacity)));
        this.magnitudes = getFrequencyDomainFrame(samples, this.fft, "blackman").magnitudeDb;
    }

    /** The window of one FFT, for the captions. */
    protected get sizeCaption() {
        return `${this.settings.size} · ${Math.round(this.settings.size / this.sampleRate * 1000)} ms`;
    }

    dispose() {
        this.fft?.dispose();
        this.fft = null;
    }
}

/** Spectrum view: magnitude against log frequency, peak and value under the mouse. */
export class ProbeFftView extends ProbeFrequencyView {
    constructor(options: ProbeViewOptions) {
        super(options, { size: 4096, floor: -100, rate: 15 });
    }

    protected read() {
        this.computeSpectrum();
    }

    protected paint(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number) {
        const caption = `${this.sizeCaption}${this.frozen ? " · frozen" : ""}`;
        drawProbeSpectrum(ctx, width, height, this.magnitudes, this.sampleRate, this.settings.floor, caption, { pixelRatio, cursorX: this.cursor?.x });
    }
}

/**
 * Spectrogram view: one column per redraw, scrolling to the left, frequency
 * on a log axis upwards. The redraw rate is the number of columns per second.
 */
export class ProbeSpectrogramView extends ProbeFrequencyView {
    /** The columns drawn so far, kept off screen and shifted at each column */
    private readonly image = document.createElement("canvas");

    constructor(options: ProbeViewOptions) {
        super(options, { size: 2048, floor: -100, rate: 30 });
    }

    protected get rates() {
        return [5, 10, 15, 30, 60];
    }

    protected read() {
        this.computeSpectrum();
        this.addColumn();
    }

    /** Shifts the image one column to the left and draws the latest spectrum at the right. */
    private addColumn() {
        const { image, canvas } = this;
        const width = Math.max(1, canvas.width);
        const height = Math.max(1, canvas.height);
        const ctx = image.getContext("2d");
        if (!ctx) return;
        if (image.width !== width || image.height !== height) {
            // A new size starts a new image
            image.width = width;
            image.height = height;
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(image, -1, 0);
        ctx.fillStyle = "#000000";
        ctx.fillRect(width - 1, 0, 1, height);
        for (let y = 0; y < height; y++) {
            const from = frequencyAtPosition((height - 1 - y) / height, this.sampleRate);
            const to = frequencyAtPosition((height - y) / height, this.sampleRate);
            const color = spectrogramColor(magnitudeBetween(this.magnitudes, from, to, this.sampleRate), this.settings.floor);
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect(width - 1, y, 1, 1);
        }
    }

    protected paint(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        if (this.image.width && this.image.height) ctx.drawImage(this.image, 0, 0, width, height);
        // Decade lines, labelled
        ctx.save();
        ctx.lineWidth = pixelRatio;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.font = `${10 * pixelRatio}px monospace`;
        ctx.fillStyle = "#c0c0c0";
        ctx.textBaseline = "bottom";
        for (let frequency = 100; frequency < this.sampleRate / 2; frequency *= 10) {
            const y = Math.round(height * (1 - positionOfFrequency(frequency, this.sampleRate))) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            ctx.fillText(formatFrequency(frequency), 4 * pixelRatio, y - 2 * pixelRatio);
        }
        ctx.textAlign = "right";
        const span = `${(width / this.settings.rate).toFixed(1)} s`;
        ctx.fillText(`${span} · ${this.sizeCaption}${this.frozen ? " · frozen" : ""}`, width - 4 * pixelRatio, height - 3 * pixelRatio);
        ctx.restore();
        if (!this.cursor) return;
        // Under the mouse: the frequency of the row and how long ago the column was drawn
        const frequency = frequencyAtPosition(1 - this.cursor.y / height, this.sampleRate);
        const ago = (width - 1 - this.cursor.x) / this.settings.rate;
        drawVerticalCursor(ctx, width, height, this.cursor.x, [`${formatFrequency(frequency)} Hz`, `-${ago.toFixed(1)} s`], pixelRatio);
    }
}
