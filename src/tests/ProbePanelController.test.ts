import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROBE_SETTINGS_KEY, ProbePanelController } from "../ui/ProbePanelController";
import { installAnimationFrameMock } from "./helpers/animationFrame";
import { installMockCanvasContext } from "./helpers/canvasContext";

const SAMPLE_RATE = 1000;

const probe = (n: number, kind = "scope", label = `${kind} ${n}`) => ({ type: "hbargraph", label, address: `/main/${label.replace(/ /g, "_")}`, meta: [{ probe: kind }] });

/** A DSP node double with two probes, or none. */
const createNode = (probes = [probe(1), probe(2)]) => {
    let handler: ((blocks: Float32Array[], index: number) => void) | null = null;
    return {
        getUI: vi.fn(() => [{ type: "vgroup", label: "main", items: probes }]),
        getProbes: vi.fn(() => probes.map(item => item.address)),
        setProbeHandler: vi.fn((next: typeof handler) => {
            handler = next;
        }),
        /** Hands a block to the panel as the DSP would. */
        send: (blocks: Float32Array[], index = 0) => handler?.(blocks, index),
        get handler() {
            return handler;
        }
    };
};

const createStorage = () => {
    const values = new Map<string, string>();
    return {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
            values.set(key, value);
        })
    };
};

type Node = ReturnType<typeof createNode>;

describe("ProbePanelController", () => {
    let frames: ReturnType<typeof installAnimationFrameMock>;
    let canvases: ReturnType<typeof installMockCanvasContext>;
    let container: HTMLDivElement;
    let storage: ReturnType<typeof createStorage>;
    let panel: ProbePanelController;

    const attach = (node: Node) => panel.attach(node as unknown as Parameters<ProbePanelController["attach"]>[0], SAMPLE_RATE);
    const views = () => Array.from(container.querySelectorAll<HTMLDivElement>(".probe-view"));
    // The canvas double gives a new context per getContext call: the last one drew last
    const drawingsOf = (canvas: HTMLCanvasElement) => canvases.contexts.filter(context => context.canvas === canvas);
    const lastDrawingOf = (canvas: HTMLCanvasElement) => drawingsOf(canvas).pop();

    beforeEach(() => {
        frames = installAnimationFrameMock();
        canvases = installMockCanvasContext();
        container = document.createElement("div");
        document.body.append(container);
        storage = createStorage();
        panel = new ProbePanelController({ container, storage, getFileName: () => "main.dsp" });
    });

    afterEach(() => {
        panel.detach();
        frames.restore();
        canvases.restore();
    });

    it("builds one scope per probe, named after its label", () => {
        attach(createNode());

        expect(panel.hasProbes).toBe(true);
        expect(views().map(view => view.dataset.address)).toEqual(["/main/scope_1", "/main/scope_2"]);
        expect(views().map(view => view.querySelector<HTMLInputElement>(".probe-name").value)).toEqual(["scope 1", "scope 2"]);
        expect(container.classList.contains("has-probes")).toBe(true);
    });

    it("shows nothing and sets no handler for a DSP without probes", () => {
        const node = createNode([]);
        attach(node);
        panel.setActive(true);

        expect(panel.hasProbes).toBe(false);
        expect(views()).toHaveLength(0);
        expect(node.setProbeHandler).not.toHaveBeenCalledWith(expect.any(Function));
    });

    it("probes only while active, and draws each scope from its blocks", () => {
        const node = createNode();
        attach(node);
        expect(node.handler).toBeNull();

        panel.setActive(true);
        expect(node.handler).toEqual(expect.any(Function));
        node.send([new Float32Array(64).fill(0.5), new Float32Array(64).fill(-0.25)]);
        frames.step(1000);
        // Each scope drew its own signal, the range set to its own peak
        const [first, second] = views().map(view => view.querySelector("canvas"));
        expect(lastDrawingOf(first).fillText).toHaveBeenCalledWith("+0.5", expect.any(Number), expect.any(Number));
        expect(lastDrawingOf(second).fillText).toHaveBeenCalledWith("+0.25", expect.any(Number), expect.any(Number));

        panel.setActive(false);
        expect(node.handler).toBeNull();
        expect(frames.frames).toHaveLength(0);
    });

    it("freezes a scope on click, and releases it on the next one", () => {
        const node = createNode();
        attach(node);
        panel.setActive(true);
        node.send([new Float32Array(64).fill(0.5), new Float32Array(64)]);
        frames.step(1000);
        const [first] = views();
        const canvas = first.querySelector("canvas");
        const freeze = first.querySelector<HTMLButtonElement>(".probe-freeze");

        canvas.dispatchEvent(new MouseEvent("click"));
        expect(freeze.classList.contains("active")).toBe(true);
        expect(lastDrawingOf(canvas).fillText).toHaveBeenCalledWith("20 ms · no trigger · frozen", expect.any(Number), expect.any(Number));
        const drawings = drawingsOf(canvas).length;
        frames.step(5000);
        // Frozen: the next frames do not redraw it
        expect(drawingsOf(canvas)).toHaveLength(drawings);

        canvas.dispatchEvent(new MouseEvent("click"));
        expect(freeze.classList.contains("active")).toBe(false);
    });

    it("reads the value under the mouse", () => {
        const node = createNode();
        attach(node);
        panel.setActive(true);
        node.send([new Float32Array(64).fill(0.75), new Float32Array(64)]);
        frames.step(1000);
        const canvas = views()[0].querySelector("canvas");

        canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 10 }));

        expect(lastDrawingOf(canvas).fillText).toHaveBeenCalledWith("0.75", expect.any(Number), expect.any(Number));
    });

    it("remembers a renamed probe for the file", () => {
        attach(createNode());
        const name = views()[1].querySelector<HTMLInputElement>(".probe-name");
        name.value = "feedback";
        name.dispatchEvent(new Event("change"));

        expect(JSON.parse(storage.getItem(PROBE_SETTINGS_KEY))["main.dsp"]["/main/scope_2"].name).toBe("feedback");
        attach(createNode());
        expect(views()[1].querySelector<HTMLInputElement>(".probe-name").value).toBe("feedback");
    });

    it("empties the panel and removes the handler on detach", () => {
        const node = createNode();
        attach(node);
        panel.setActive(true);

        panel.detach();

        expect(node.handler).toBeNull();
        expect(views()).toHaveLength(0);
        expect(container.classList.contains("has-probes")).toBe(false);
    });

    it("gives a phase the two signals of its pair", () => {
        const node = createNode([probe(1, "phase", "phase 1 x"), probe(1), probe(1, "phase", "phase 1 y")]);
        attach(node);
        panel.setActive(true);

        expect(views().map(view => view.dataset.address)).toEqual(["/main/scope_1", "/main/phase_1_x"]);
        node.send([new Float32Array(64).fill(0.5), new Float32Array(64), new Float32Array(64).fill(-0.25)]);
        frames.step(1000);
        // The range of the portrait is the peak of x (0.5) and y (0.25), not the scope's 0
        const phaseCanvas = views()[1].querySelector("canvas");
        expect(lastDrawingOf(phaseCanvas).fillText).toHaveBeenCalledWith("±0.5", expect.any(Number), expect.any(Number));
    });

    it("keeps probing while a recorder records, even with the Probes tab hidden", () => {
        const node = createNode([probe(1, "rec")]);
        attach(node);
        panel.setActive(true);
        views()[0].querySelector("canvas").dispatchEvent(new MouseEvent("click"));

        panel.setActive(false);
        expect(node.handler).toEqual(expect.any(Function));
        expect(frames.frames).toHaveLength(0);

        views()[0].querySelector<HTMLButtonElement>(".probe-record").click();
        expect(node.handler).toBeNull();
    });

    it("saves a recording in progress when the probes go", async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        const node = createNode([probe(1, "rec")]);
        attach(node);
        panel.setActive(true);
        views()[0].querySelector("canvas").dispatchEvent(new MouseEvent("click"));
        node.send([new Float32Array(64).fill(0.5)], 0);

        panel.detach();
        await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1));
        expect(node.handler).toBeNull();
    });
});
