import { drawProbeScope, findRisingTrigger, formatScopeDuration, scopeHalfRange } from "./ProbeScopeRenderer";
import type { ProbeScopeRange } from "./ProbeScopeRenderer";
import { ProbeView } from "./ProbeView";
import type { ProbeViewOptions, ProbeViewSettings } from "./ProbeView";

/**
 * Oscilloscope view (`pr.scope`): the last window of the signal, triggered on
 * a rising zero crossing if asked, with the value under the mouse.
 */

export type ScopeSettings = ProbeViewSettings & {
    /** Window length in seconds */
    window: number;
    range: ProbeScopeRange;
    trigger: boolean;
};

export const SCOPE_WINDOWS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2];
export const SCOPE_RANGES: ProbeScopeRange[] = ["auto", 2, 1, 0.5, 0.1, 0.01];

export class ProbeScopeView extends ProbeView<ScopeSettings> {
    /** The window last read */
    private samples: Float32Array = new Float32Array(0);
    private caption = "";

    constructor(options: ProbeViewOptions) {
        super(options, { window: 0.02, rate: 15, range: "auto", trigger: true });
    }

    protected createControls() {
        const { settings } = this;
        return [
            this.createSelect("probe-window", "Window", SCOPE_WINDOWS, settings.window, formatScopeDuration, (value) => {
                settings.window = value;
                this.redraw();
            }),
            this.createSelect("probe-range", "Vertical range", SCOPE_RANGES, settings.range, value => (value === "auto" ? "auto" : `±${value}`), (value) => {
                settings.range = value;
                this.redraw();
            }),
            this.createToggle("probe-trigger", "Trigger", "Start on a rising zero crossing", settings.trigger, (on) => {
                settings.trigger = on;
                this.redraw();
            })
        ];
    }

    protected read() {
        const { settings } = this;
        const [history] = this.histories;
        const windowLength = Math.max(2, Math.round(settings.window * this.sampleRate));
        this.caption = formatScopeDuration(settings.window);
        if (settings.trigger) {
            const recent = history.read(new Float32Array(2 * windowLength));
            const trigger = findRisingTrigger(recent, windowLength);
            // Without a crossing, the latest window, untriggered
            const start = trigger < 0 ? windowLength : trigger;
            this.samples = recent.subarray(start, start + windowLength);
            if (trigger < 0) this.caption += " · no trigger";
        } else {
            this.samples = history.read(new Float32Array(windowLength));
        }
    }

    protected paint(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number) {
        const caption = this.frozen ? `${this.caption} · frozen` : this.caption;
        drawProbeScope(ctx, width, height, this.samples, scopeHalfRange(this.samples, this.settings.range), caption, {
            pixelRatio,
            cursorX: this.cursor?.x,
            sampleRate: this.sampleRate
        });
    }
}
