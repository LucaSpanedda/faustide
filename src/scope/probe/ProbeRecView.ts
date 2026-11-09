import { Recorder } from "../../Recorder";
import { drawCanvasBackground } from "../CanvasDrawing";
import { downloadBlobFile } from "../DownloadFile";
import { ProbeView } from "./ProbeView";
import type { ProbeViewOptions, ProbeViewSettings } from "./ProbeView";

/**
 * Recorder view (`pr.rec`): records the probed signal between a start and a
 * stop, and downloads it as a WAV file named after the DSP file and the probe.
 *
 * It receives every block from the panel (`receive`), so nothing is missed,
 * and keeps the panel probing while it records, even if the Probes tab is
 * hidden. The encoding is the IDE recorder's (`Recorder`). A click on the box
 * starts or stops the recording, as the Rec button does.
 */

/** File name of a recording: DSP file, probe name and time, without unsafe characters. */
export const recordingFileName = (fileName: string, probeName: string, date: Date) => {
    const pad = (n: number) => `${n}`.padStart(2, "0");
    const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    const safe = (text: string) => text.replace(/\.[^.]*$/, "").replace(/[^\w-]+/g, "_");
    return `${safe(fileName)}-${safe(probeName)}-${stamp}.wav`;
};

/** Formats seconds as m:ss.s */
const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

export class ProbeRecView extends ProbeView<ProbeViewSettings> {
    private recorder: Recorder | null = null;
    private recordButton?: HTMLButtonElement;
    /** What the box says when not recording */
    private status = "Click to record";

    constructor(options: ProbeViewOptions) {
        super(options, { rate: 10 });
    }

    /** No rate control: the box only shows the elapsed time. */
    protected get rates(): number[] {
        return [];
    }

    protected get freezable() {
        return false;
    }

    get needsProbing() {
        return !!this.recorder;
    }

    /** Whether a recording is in progress. */
    get recording() {
        return !!this.recorder;
    }

    protected createControls() {
        this.recordButton = this.createToggle("probe-record", "Rec", "Start or stop recording (or click the box)", false, (on) => {
            if (on) this.start();
            else void this.stop();
        }, false);
        return [this.recordButton];
    }

    receive(blocks: Float32Array[], index: number) {
        this.recorder?.append([blocks[0]], index);
    }

    protected onCanvasClick() {
        if (this.recorder) void this.stop();
        else this.start();
    }

    /** Starts a new recording. */
    start() {
        if (this.recorder) return;
        this.recorder = new Recorder(this.sampleRate);
        this.recorder.enabled = true;
        this.setButton(true);
        this.onProbingChange();
        this.render();
    }

    /**
     * Stops the recording and downloads it.
     *
     * @returns the file name, or undefined if nothing was recorded
     */
    async stop() {
        const { recorder } = this;
        if (!recorder) return undefined;
        this.recorder = null;
        recorder.enabled = false;
        this.setButton(false);
        this.onProbingChange();
        const seconds = recorder.totalSec;
        const wav = await recorder.encode();
        if (!wav) {
            this.status = "Nothing recorded";
            this.render();
            return undefined;
        }
        const fileName = recordingFileName(this.getFileName(), this.settings.name, new Date());
        downloadBlobFile(new Blob([wav], { type: "audio/wav" }), fileName);
        this.status = `Saved ${fileName} (${formatElapsed(seconds)})`;
        this.render();
        return fileName;
    }

    /** A recording in progress is saved rather than lost when the probes go. */
    dispose() {
        if (this.recorder) void this.stop();
    }

    private setButton(on: boolean) {
        if (!this.recordButton) return;
        this.recordButton.classList.toggle("active", on);
        this.recordButton.setAttribute("aria-pressed", String(on));
    }

    protected read() {}

    protected paint(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number) {
        drawCanvasBackground(ctx, width, height, "#000000");
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (this.recorder) {
            ctx.font = `${18 * pixelRatio}px monospace`;
            ctx.textAlign = "right";
            ctx.fillStyle = "#ff4040";
            ctx.fillText("●", width / 2 - 70 * pixelRatio, height / 2);
            ctx.textAlign = "left";
            ctx.fillStyle = "#FFFFFF";
            ctx.fillText(`REC ${formatElapsed(this.recorder.totalSec)}`, width / 2 - 60 * pixelRatio, height / 2);
        } else {
            ctx.fillStyle = "#909090";
            ctx.font = `${11 * pixelRatio}px monospace`;
            ctx.fillText(this.status, width / 2, height / 2);
        }
        ctx.restore();
    }
}
