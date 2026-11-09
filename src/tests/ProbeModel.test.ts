import { describe, expect, it } from "vitest";
import type { FaustUIDescriptor } from "@grame/faustwasm";
import { findProbes, sortProbes, stripProbes } from "../runtime/ProbeModel";
import type { ProbeDescriptor } from "../runtime/ProbeModel";

const bargraph = (label: string, address: string, probe?: string) => ({
    type: "hbargraph", label, shortname: label, address, index: 0, min: -1, max: 1, ...(probe ? { meta: [{ probe }] } : {})
});

/** The UI JSON of a DSP with two scopes (one alone in a group), a phase pair, a meter and an unknown kind. */
const UI = [{
    type: "vgroup",
    label: "dsp",
    items: [
        { type: "hslider", label: "freq", shortname: "freq", address: "/dsp/freq", index: 0, init: 440, min: 20, max: 2000, step: 1 },
        bargraph("scope 2", "/dsp/scope_2", "scope"),
        { type: "hgroup", label: "loop", items: [bargraph("scope 1", "/dsp/loop/scope_1", "scope")] },
        bargraph("phase 1 x", "/dsp/phase_1_x", "phase"),
        bargraph("phase 1 y", "/dsp/phase_1_y", "phase"),
        bargraph("level", "/dsp/level"),
        bargraph("unknown", "/dsp/unknown", "teapot")
    ]
}] as unknown as FaustUIDescriptor;

describe("ProbeModel", () => {
    it("lists the probes in the order of the node's probe list, with their positions in it", () => {
        const probes = findProbes(UI, ["/dsp/loop/scope_1", "/dsp/scope_2"]);
        expect(probes).toEqual([
            { key: "/dsp/loop/scope_1", kind: "scope", label: "scope 1", channels: [0] },
            { key: "/dsp/scope_2", kind: "scope", label: "scope 2", channels: [1] }
        ]);
    });

    it("leaves out plain bargraphs, unknown kinds, and addresses the UI does not have", () => {
        const probes = findProbes(UI, ["/dsp/level", "/dsp/unknown", "/dsp/missing", "/dsp/scope_2"]);
        expect(probes).toEqual([{ key: "/dsp/scope_2", kind: "scope", label: "scope 2", channels: [3] }]);
    });

    it("joins the x and y probes of a phase into one view, whatever their order", () => {
        expect(findProbes(UI, ["/dsp/phase_1_x", "/dsp/scope_2", "/dsp/phase_1_y"])).toEqual([
            { key: "/dsp/scope_2", kind: "scope", label: "scope 2", channels: [1] },
            { key: "/dsp/phase_1_x", kind: "phase", label: "phase 1", channels: [0, 2] }
        ]);
        expect(findProbes(UI, ["/dsp/phase_1_y", "/dsp/phase_1_x"])).toEqual([
            { key: "/dsp/phase_1_x", kind: "phase", label: "phase 1", channels: [1, 0] }
        ]);
    });

    it("leaves out a phase missing one of its axes", () => {
        expect(findProbes(UI, ["/dsp/phase_1_x"])).toEqual([]);
    });

    it("strips every probe, and the groups left empty, from the controls", () => {
        const stripped = stripProbes(UI);
        expect(JSON.stringify(stripped)).not.toContain("\"probe\"");
        // "loop" held only a probe; "unknown" is a probe of a kind not drawn
        expect((stripped[0].items as { label: string }[]).map(item => item.label)).toEqual(["freq", "level"]);
    });

    it("keeps the root group even when empty", () => {
        const onlyProbes = [{ type: "vgroup", label: "dsp", items: [UI[0].items[1]] }] as unknown as FaustUIDescriptor;
        expect(stripProbes(onlyProbes)).toEqual([{ type: "vgroup", label: "dsp", items: [] }]);
    });

    it("does not modify the UI it is given", () => {
        const before = JSON.stringify(UI);
        stripProbes(UI);
        expect(JSON.stringify(UI)).toBe(before);
    });

    it("orders views by kind, then by number", () => {
        const view = (kind: ProbeDescriptor["kind"], n: number): ProbeDescriptor => ({ key: `/${kind}_${n}`, kind, label: `${kind} ${n}`, channels: [0] });
        const sorted = sortProbes([view("rec", 1), view("scope", 10), view("fft", 1), view("scope", 2), view("phase", 1)]);
        expect(sorted.map(probe => probe.label)).toEqual(["scope 2", "scope 10", "phase 1", "fft 1", "rec 1"]);
    });
});
