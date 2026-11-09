import type { FaustAudioWorkletNode, FaustScriptProcessorNode } from "@grame/faustwasm";
import { ProbeHistory } from "../runtime/ProbeHistory";
import { findProbes, sortProbes } from "../runtime/ProbeModel";
import { createProbeView } from "../scope/probe/createProbeView";
import type { ProbeView } from "../scope/probe/ProbeView";

type DspNode = FaustAudioWorkletNode | FaustScriptProcessorNode;

type ProbeStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
};

type ProbePanelControllerOptions = {
    /** The element the probe views are built in */
    container: HTMLElement;
    /** Persistence for names and view settings (production: `safeStorage`) */
    storage: ProbeStorage;
    /** Name of the file being run, to remember settings per file */
    getFileName: () => string;
};

/** localStorage key of the probe view settings. */
export const PROBE_SETTINGS_KEY = "faust_editor_probes";

/**
 * History kept per probe signal, in seconds: twice the longest scope window,
 * so that a trigger can be searched in it.
 */
const HISTORY_SECONDS = 4;

/**
 * Shows the probes of the running DSP in the Probes tab.
 *
 * On `attach`, the panel lists the probes of the node (see `ProbeModel`),
 * keeps a history of each probe signal, and builds one view per probe (see
 * `ProbeView`). While probing, the node renders frame by frame and hands the
 * probes over block by block (`setProbeHandler`): each block goes into its
 * history, and to the views that must receive every block. The panel probes
 * while it is active (Probes tab shown) or while a view needs it (a recorder
 * recording); otherwise the handler is removed, so the DSP costs what it costs
 * without probes. While active, every view redraws at its own rate.
 */
export class ProbePanelController {
    private readonly container: HTMLElement;
    private readonly storage: ProbeStorage;
    private readonly getFileName: () => string;
    private node: DspNode | null = null;
    private views: ProbeView[] = [];
    private histories: ProbeHistory[] = [];
    private active = false;
    private probing = false;
    private frame = 0;

    constructor(options: ProbePanelControllerOptions) {
        this.container = options.container;
        this.storage = options.storage;
        this.getFileName = options.getFileName;
    }

    /** Whether the running DSP has probes the panel shows. */
    get hasProbes() {
        return this.views.length > 0;
    }

    /**
     * Shows the probes of a freshly compiled DSP, replacing the previous ones.
     *
     * @param node the running DSP node
     * @param sampleRate the audio context sample rate, to size the histories
     */
    attach(node: DspNode, sampleRate: number) {
        this.detach();
        const addresses = node.getProbes?.() ?? [];
        const probes = sortProbes(findProbes(node.getUI(), addresses));
        if (!probes.length) return;
        this.node = node;
        this.histories = addresses.map(() => new ProbeHistory(HISTORY_SECONDS * sampleRate));
        const saved = this.loadSettings();
        this.views = probes.map(probe => createProbeView({
            probe,
            histories: probe.channels.map(channel => this.histories[channel]),
            sampleRate,
            saved: saved[probe.key],
            save: () => this.saveSettings(),
            getFileName: this.getFileName,
            onProbingChange: () => this.update()
        }));
        this.container.append(...this.views.map(view => view.element));
        this.container.classList.add("has-probes");
        this.update();
    }

    /** Removes the probes of the current DSP and hides the panel. */
    detach() {
        // First, so that a recording in progress still has its last blocks
        this.views.forEach(view => view.dispose());
        this.setProbing(false);
        this.stopDrawing();
        this.node = null;
        this.views = [];
        this.histories = [];
        this.container.replaceChildren();
        this.container.classList.remove("has-probes");
    }

    /**
     * Shows the probes (Probes tab shown) or hides them.
     *
     * @param active whether the probe views are visible
     */
    setActive(active: boolean) {
        this.active = active;
        this.update();
    }

    /** Probes while active or needed by a view, and draws while active. */
    private update() {
        this.setProbing(!!this.node && (this.active || this.views.some(view => view.needsProbing)));
        if (this.active && this.node) this.startDrawing();
        else this.stopDrawing();
    }

    /** Sets or removes the probe handler. */
    private setProbing(probing: boolean) {
        if (probing === this.probing) return;
        this.probing = probing;
        if (!probing) {
            this.node?.setProbeHandler(null);
            return;
        }
        this.node.setProbeHandler((blocks: Float32Array[], index: number) => {
            for (let i = 0; i < this.histories.length; i++) this.histories[i].push(blocks[i]);
            for (const view of this.views) {
                if (view.needsProbing) view.receive(view.probe.channels.map(channel => blocks[channel]), index);
            }
        });
    }

    /** Redraws every view at its own rate, on every animation frame. */
    private startDrawing() {
        if (this.frame) return;
        const loop = (time: number) => {
            for (const view of this.views) view.tick(time);
            this.frame = requestAnimationFrame(loop);
        };
        this.frame = requestAnimationFrame(loop);
    }

    private stopDrawing() {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
    }

    /** Settings of every probe of the current file, by probe key. */
    private loadSettings(): Record<string, Record<string, unknown>> {
        try {
            const all = JSON.parse(this.storage.getItem(PROBE_SETTINGS_KEY) || "{}");
            return all[this.getFileName()] || {};
        } catch {
            return {};
        }
    }

    /** Saves the settings of the current probes, keeping other files' ones. */
    private saveSettings() {
        let all: Record<string, unknown> = {};
        try {
            all = JSON.parse(this.storage.getItem(PROBE_SETTINGS_KEY) || "{}");
        } catch {
            all = {};
        }
        all[this.getFileName()] = Object.fromEntries(this.views.map(view => [view.probe.key, view.settings]));
        this.storage.setItem(PROBE_SETTINGS_KEY, JSON.stringify(all));
    }
}
