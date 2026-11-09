import type { ProbeHistory } from "../../runtime/ProbeHistory";
import type { ProbeDescriptor } from "../../runtime/ProbeModel";

/**
 * Base of the probe views: one box of the Probes tab, for one probe.
 *
 * A view owns its DOM (a header with the probe's name and controls, and a
 * canvas), its settings, and when it redraws. Every view shares the same
 * behaviour: an editable name, a redraw rate, a click on the canvas to freeze
 * or release it, and the mouse over the canvas to read the values there,
 * frozen or not. Subclasses add their controls, read their data from the
 * probe histories and paint it. A view never talks to the DSP node: the probe
 * panel feeds the histories, and calls `tick` on every animation frame.
 */

/** Settings every view has. Subclasses add theirs; all are saved per file. */
export type ProbeViewSettings = {
    name: string;
    /** Redraws per second */
    rate: number;
};

export type ProbeViewOptions = {
    probe: ProbeDescriptor;
    /** The histories of the probe's signals, in the order of `probe.channels` */
    histories: ProbeHistory[];
    sampleRate: number;
    /** Settings saved for this probe, if any */
    saved?: Partial<ProbeViewSettings> & Record<string, unknown>;
    /** Saves the settings of every view */
    save: () => void;
    /** Name of the file being run, for downloads */
    getFileName: () => string;
    /** Called when the view starts or stops needing the probes while hidden */
    onProbingChange: () => void;
};

/** Redraw rates offered by default, per second. */
export const PROBE_RATES = [1, 2, 5, 10, 15, 30, 60];

export abstract class ProbeView<S extends ProbeViewSettings = ProbeViewSettings> {
    readonly element: HTMLDivElement;
    readonly canvas: HTMLCanvasElement;
    readonly settings: S;
    readonly probe: ProbeDescriptor;
    protected readonly histories: ProbeHistory[];
    protected readonly sampleRate: number;
    protected readonly save: () => void;
    protected readonly getFileName: () => string;
    protected readonly onProbingChange: () => void;
    protected frozen = false;
    /** Mouse position over the canvas in device pixels, if over it */
    protected cursor?: { x: number; y: number };
    private lastDraw = -Infinity;
    private freezeButton?: HTMLButtonElement;

    /**
     * @param options the probe, its histories and the panel's callbacks
     * @param defaults the settings of a probe that has none saved, but its name
     */
    constructor(options: ProbeViewOptions, defaults: Omit<S, "name">) {
        this.probe = options.probe;
        this.histories = options.histories;
        this.sampleRate = options.sampleRate;
        this.save = options.save;
        this.getFileName = options.getFileName;
        this.onProbingChange = options.onProbingChange;
        this.settings = { ...defaults, name: options.probe.label, ...options.saved } as S;
        this.element = document.createElement("div");
        this.canvas = document.createElement("canvas");
    }

    /**
     * Builds the DOM. Separate from the constructor, which runs before the
     * fields of subclasses exist.
     *
     * @returns the view
     */
    build() {
        const { element, canvas, probe, settings } = this;
        element.className = `probe-view probe-view-${probe.kind}`;
        element.dataset.address = probe.key;
        const header = document.createElement("div");
        header.className = "probe-view-header";
        const name = document.createElement("input");
        name.className = "probe-name";
        name.value = settings.name;
        name.title = `${probe.label} (${probe.key})`;
        name.spellcheck = false;
        name.addEventListener("change", () => {
            settings.name = name.value.trim() || probe.label;
            name.value = settings.name;
            this.save();
        });
        header.append(name, ...this.createControls());
        if (this.rates.length) {
            header.append(this.createSelect("probe-rate", "Redraws per second", this.rates, settings.rate, value => `${value} Hz`, (value) => {
                settings.rate = value;
            }));
        }
        if (this.freezable) {
            this.freezeButton = this.createToggle("probe-freeze", "Freeze", "Hold the current drawing (or click it)", false, on => this.setFrozen(on), false);
            header.append(this.freezeButton);
        }
        canvas.className = "probe-canvas";
        this.bindCanvas();
        element.append(header, canvas);
        return this;
    }

    /** The redraw rates offered; none hides the rate control. */
    protected get rates() {
        return PROBE_RATES;
    }

    /** Whether the view can be frozen; when not, a click goes to `onCanvasClick`. */
    protected get freezable() {
        return true;
    }

    /** Whether the view needs the probes even while the Probes tab is hidden. */
    get needsProbing() {
        return false;
    }

    /** The controls of the kind, between the name and the rate. */
    protected abstract createControls(): HTMLElement[];

    /** Reads what will be painted from the histories. */
    protected abstract read(): void;

    /**
     * Paints what was last read, and the cursor if the mouse is over the canvas.
     *
     * @param ctx the canvas context
     * @param width canvas width in device pixels
     * @param height canvas height in device pixels
     * @param pixelRatio device pixels per CSS pixel
     */
    protected abstract paint(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number): void;

    /**
     * Receives every block of the probe's signals, in order. Only views that
     * must not miss a sample (a recorder) need it: the others read the
     * histories when they redraw.
     *
     * @param blocks the blocks of the probe's signals, in the order of `probe.channels`
     * @param index the block number, counting up
     */
    receive(blocks: Float32Array[], index: number) {}

    /**
     * Called on every animation frame: reads and redraws when the redraw
     * period has elapsed, unless frozen.
     *
     * @param time the frame time in milliseconds
     */
    tick(time: number) {
        if (this.frozen || time - this.lastDraw < 1000 / this.settings.rate) return;
        this.lastDraw = time;
        this.read();
        this.render();
    }

    /** Sizes the canvas to its box and paints. */
    render() {
        const { canvas } = this;
        const pixelRatio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
        const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) this.paint(ctx, width, height, pixelRatio);
    }

    /** Releases what the view holds (an FFT, a recording in progress) when the probes go. */
    dispose() {}

    /** Shows a change of settings at once, even frozen. */
    protected redraw() {
        this.lastDraw = -Infinity;
        if (!this.frozen) return;
        this.read();
        this.render();
    }

    /**
     * Freezes or releases the view, keeping its button in step.
     *
     * @param frozen whether to hold the current drawing
     */
    setFrozen(frozen: boolean) {
        this.frozen = frozen;
        if (this.freezeButton) {
            this.freezeButton.classList.toggle("active", frozen);
            this.freezeButton.setAttribute("aria-pressed", String(frozen));
        }
        this.lastDraw = -Infinity;
        this.render();
    }

    /** What a click on the canvas does for a view that cannot be frozen. */
    protected onCanvasClick() {}

    /** Click to freeze or release, mouse over to read the values. */
    private bindCanvas() {
        const { canvas } = this;
        canvas.title = this.freezable ? "Click to freeze or release" : "";
        canvas.addEventListener("click", () => {
            if (this.freezable) this.setFrozen(!this.frozen);
            else this.onCanvasClick();
        });
        canvas.addEventListener("mousemove", (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const pixelRatio = window.devicePixelRatio || 1;
            this.cursor = { x: (e.clientX - rect.left) * pixelRatio, y: (e.clientY - rect.top) * pixelRatio };
            this.render();
        });
        canvas.addEventListener("mouseleave", () => {
            this.cursor = undefined;
            this.render();
        });
    }

    /**
     * A select whose change updates the settings and saves them.
     *
     * @param className the class of the select
     * @param title its tooltip
     * @param values the values offered
     * @param current the value selected
     * @param format the text shown for a value
     * @param onChange called with the value chosen, before saving
     */
    protected createSelect<T extends number | string>(className: string, title: string, values: T[], current: T, format: (value: T) => string, onChange: (value: T) => void) {
        const select = document.createElement("select");
        select.className = `custom-select custom-select-sm ${className}`;
        select.title = title;
        values.forEach((value, index) => select.append(new Option(format(value), String(index), false, value === current)));
        select.addEventListener("change", () => {
            onChange(values[+select.value]);
            this.save();
        });
        return select;
    }

    /**
     * A toggle button, whose change is saved with the settings unless
     * `persist` is false.
     *
     * @param className the class of the button
     * @param label its text
     * @param title its tooltip
     * @param on whether it starts on
     * @param onChange called with the new state
     * @param persist whether to save the settings after a change
     */
    protected createToggle(className: string, label: string, title: string, on: boolean, onChange: (on: boolean) => void, persist = true) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn btn-outline-light btn-sm ${className}`;
        button.textContent = label;
        button.title = title;
        button.classList.toggle("active", on);
        button.setAttribute("aria-pressed", String(on));
        button.addEventListener("click", () => {
            const next = !button.classList.contains("active");
            button.classList.toggle("active", next);
            button.setAttribute("aria-pressed", String(next));
            onChange(next);
            if (persist) this.save();
        });
        return button;
    }
}
