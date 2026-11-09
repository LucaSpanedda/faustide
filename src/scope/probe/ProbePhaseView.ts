import { drawProbePhase, phaseHalfRange } from "./ProbePhaseRenderer";
import { formatScopeDuration } from "./ProbeScopeRenderer";
import type { ProbeScopeRange } from "./ProbeScopeRenderer";
import { SCOPE_RANGES } from "./ProbeScopeView";
import { ProbeView } from "./ProbeView";
import type { ProbeViewOptions, ProbeViewSettings } from "./ProbeView";

/**
 * Phase portrait view (`pr.phase`): the last window of one signal (x) against
 * another (y), with the values under the mouse.
 */

export type PhaseSettings = ProbeViewSettings & {
    /** Length of the trace in seconds */
    window: number;
    range: ProbeScopeRange;
};

export const PHASE_WINDOWS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2];

export class ProbePhaseView extends ProbeView<PhaseSettings> {
    private x: Float32Array = new Float32Array(0);
    private y: Float32Array = new Float32Array(0);

    constructor(options: ProbeViewOptions) {
        super(options, { window: 0.05, rate: 15, range: "auto" });
    }

    protected createControls() {
        const { settings } = this;
        return [
            this.createSelect("probe-window", "Length of the trace", PHASE_WINDOWS, settings.window, formatScopeDuration, (value) => {
                settings.window = value;
                this.redraw();
            }),
            this.createSelect("probe-range", "Range", SCOPE_RANGES, settings.range, value => (value === "auto" ? "auto" : `±${value}`), (value) => {
                settings.range = value;
                this.redraw();
            })
        ];
    }

    protected read() {
        const length = Math.max(2, Math.round(this.settings.window * this.sampleRate));
        const [x, y] = this.histories;
        this.x = x.read(new Float32Array(length));
        this.y = y.read(new Float32Array(length));
    }

    protected paint(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number) {
        const caption = `${formatScopeDuration(this.settings.window)}${this.frozen ? " · frozen" : ""}`;
        drawProbePhase(ctx, width, height, this.x, this.y, phaseHalfRange(this.x, this.y, this.settings.range), caption, { pixelRatio, cursor: this.cursor });
    }
}
