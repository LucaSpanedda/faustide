import type { FaustUIDescriptor, FaustUIItem } from "@grame/faustwasm";

/**
 * Probe descriptors and probe-free UI, read from a compiled DSP's UI JSON.
 *
 * A probe is a bargraph carrying the `[probe:kind]` metadata (see
 * `src/probes/probes.lib`). The runtime reads it on every frame and draws it in
 * the probe panel; the DSP controls must not show it as a bargraph. This module
 * only reads and filters JSON: it neither talks to the DSP node nor draws.
 */

/** The kinds of probes the panel can draw. */
export type ProbeKind = "scope" | "phase" | "fft" | "spectrogram" | "number" | "rec";

export const PROBE_KINDS: ProbeKind[] = ["scope", "phase", "fft", "spectrogram", "number", "rec"];

/**
 * Kinds drawn from two signals. Their probes come in pairs whose labels end in
 * " x" and " y" (e.g. "phase 1 x", "phase 1 y"): one view per pair.
 */
const TWO_SIGNAL_KINDS: ProbeKind[] = ["phase"];

export type ProbeDescriptor = {
    /** Identifies the view: the address of its probe, or of the x probe of a pair */
    key: string;
    kind: ProbeKind;
    /** Label from the Faust code, e.g. "scope 1", without the axis of a pair */
    label: string;
    /** Positions in the node's probe list of the signals drawn, in order (x, y) */
    channels: number[];
};

/** Returns the `probe` metadata value of an item, or undefined if it is not a probe. */
const probeMeta = (item: FaustUIItem): string | undefined => {
    if (item.type !== "hbargraph" && item.type !== "vbargraph") return undefined;
    const meta = item.meta?.find(entry => "probe" in entry);
    return meta ? (meta as { probe: string }).probe : undefined;
};

/** Calls `callback` on every non-group item of the UI tree. */
const forEachItem = (items: FaustUIItem[], callback: (item: FaustUIItem) => void) => {
    for (const item of items) {
        if ("items" in item) forEachItem(item.items, callback);
        else callback(item);
    }
};

/**
 * Lists the probe views of a DSP, in the order of the node's probe list.
 *
 * @param ui the UI JSON of the DSP
 * @param addresses the node's probe addresses (`getProbes()`), which fix the
 * order of the blocks given to the probe handler
 * @returns one descriptor per view the panel can draw; a pair missing one of
 * its axes is left out
 */
export const findProbes = (ui: FaustUIDescriptor, addresses: string[]): ProbeDescriptor[] => {
    const items = new Map<string, { kind: ProbeKind; label: string }>();
    forEachItem(ui, (item) => {
        const kind = probeMeta(item) as ProbeKind;
        if (!("address" in item) || !PROBE_KINDS.includes(kind)) return;
        items.set(item.address, { kind, label: item.label });
    });
    const descriptors: ProbeDescriptor[] = [];
    const pairs = new Map<string, { x?: number; y?: number; key?: string }>();
    addresses.forEach((address, channel) => {
        const item = items.get(address);
        if (!item) return;
        if (!TWO_SIGNAL_KINDS.includes(item.kind)) {
            descriptors.push({ key: address, kind: item.kind, label: item.label, channels: [channel] });
            return;
        }
        const axis = item.label.slice(-2);
        if (axis !== " x" && axis !== " y") return;
        const label = item.label.slice(0, -2);
        const pair = pairs.get(`${item.kind}/${label}`) || {};
        if (axis === " x") {
            pair.x = channel;
            pair.key = address;
        } else {
            pair.y = channel;
        }
        pairs.set(`${item.kind}/${label}`, pair);
        if (pair.x !== undefined && pair.y !== undefined) {
            descriptors.push({ key: pair.key, kind: item.kind, label, channels: [pair.x, pair.y] });
        }
    });
    return descriptors;
};

/**
 * Orders probe views for display: by kind (as in `PROBE_KINDS`), then by
 * label, numbers compared as numbers ("scope 2" before "scope 10"). The node
 * lists its probes in the order of the compiler's UI JSON, which is not the
 * order of the code.
 *
 * @param probes the descriptors from `findProbes`
 * @returns a sorted copy
 */
export const sortProbes = (probes: ProbeDescriptor[]): ProbeDescriptor[] => probes.slice().sort((a, b) =>
    PROBE_KINDS.indexOf(a.kind) - PROBE_KINDS.indexOf(b.kind) || a.label.localeCompare(b.label, undefined, { numeric: true }));

/**
 * Returns a copy of the UI without probes, and without the groups left empty
 * by removing them, for the DSP controls view.
 *
 * @param ui the UI JSON of the DSP
 */
export const stripProbes = (ui: FaustUIDescriptor): FaustUIDescriptor => {
    const strip = (items: FaustUIItem[]): FaustUIItem[] => items.flatMap((item): FaustUIItem[] => {
        if ("items" in item) {
            const kept = strip(item.items);
            return kept.length ? [{ ...item, items: kept }] : [];
        }
        return probeMeta(item) === undefined ? [item] : [];
    });
    // The root groups stay, even empty: the UI needs one to draw anything
    return ui.map((group: FaustUIItem) => ("items" in group ? { ...group, items: strip(group.items) } : group)) as FaustUIDescriptor;
};
