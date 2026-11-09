import { beforeEach, describe, expect, it, vi } from "vitest";
import { FaustUiController } from "../ui/FaustUiController";

const setupDom = () => {
    document.body.innerHTML = `
        <iframe id="iframe-faust-ui"></iframe>
        <div id="faust-ui-default"></div>
        <div id="nav-item-faust-ui"><button class="btn-popup"></button><button class="btn-close-tab"></button></div>
        <div id="output-analyser-ui"></div>
        <div id="tab-faust-ui"></div>
        <div id="nav-item-probes"><div id="tab-probes"></div></div>
        <div id="tab-diagram"></div>
        <div id="dsp-ui-detail"></div>
        <div id="dsp-ui-default"></div>
        <div id="dsp-ui-detail-inputs"></div>
        <div id="dsp-ui-detail-outputs"></div>
        <div id="dsp-ui-detail-params"></div>
    `;
    ($.fn as any).tab = vi.fn(function tab() {
        return this;
    });
};

const createNode = () => ({
    setOutputParamHandler: vi.fn(),
    getUI: vi.fn(() => [{ type: "vslider" }]),
    getParams: vi.fn(() => ["/gain"]),
    getParamValue: vi.fn(() => 0.5),
    getNumInputs: vi.fn(() => 1),
    getNumOutputs: vi.fn(() => 2),
    setParamValue: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn()
});

const bindController = (overrides: any = {}) => {
    const audioEnv = {
        dspConnectedToInput: false,
        dspConnectedToOutput: false,
        inputEnabled: false,
        outputEnabled: false,
        ...overrides.audioEnv
    };
    const uiEnv = {
        outputScope: { disabled: true },
        ...overrides.uiEnv
    };
    const options = {
        audioEnv,
        uiEnv,
        compileOptions: { saveParams: true, popup: false, args: [] },
        fileManager: {
            mainFileName: "main.dsp",
            mainFileNameWithoutSuffix: "main",
            mainCode: "process = _;"
        },
        dspParams: { "/gain": 0.5 },
        faustCompiler: { expandDSP: vi.fn(() => "expanded = _;") },
        exportService: {
            buildSourceFile: vi.fn(() => new File([""], "main.dsp")),
            uploadAndPrecompile: vi.fn(async () => ({ href: "https://exported" }))
        },
        getServer: () => "https://service",
        getMidiController: vi.fn(() => ({ handleKeyDown: vi.fn(), handleKeyUp: vi.fn() })),
        saveDspParams: vi.fn(),
        ...overrides.options
    };
    const controller = new FaustUiController(options as any);
    controller.bind();
    return { controller, options, audioEnv, uiEnv };
};

describe("FaustUiController", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        setupDom();
    });

    it("shows a compiled DSP node and posts UI state to the iframe", () => {
        const { controller, uiEnv } = bindController();
        const node = createNode();
        const postMessage = vi.fn();
        Object.defineProperty($("#iframe-faust-ui")[0], "contentWindow", { value: { postMessage }, configurable: true });

        controller.showCompiledDsp(node as unknown as Parameters<typeof controller.showCompiledDsp>[0]);

        expect(node.setOutputParamHandler).toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith({ type: "ui", ui: [{ type: "vslider" }] }, "*");
        expect(postMessage).toHaveBeenCalledWith({ path: "/gain", value: 0.5, type: "param" }, "*");
        expect($("#faust-ui-default").css("display")).toBe("none");
        expect($("#iframe-faust-ui").css("visibility")).toBe("visible");
        expect(uiEnv.outputScope.disabled).toBe(false);
        expect($("#dsp-ui-detail-inputs").html()).toBe("1");
    });

    it("uses remembered state while an AudioWorklet getter still reports its default", () => {
        const { controller } = bindController({ options: { dspParams: { "/gain": 0.75 } } });
        const node = createNode();
        node.getParamValue.mockReturnValue(0.2);
        const postMessage = vi.fn();
        Object.defineProperty($("#iframe-faust-ui")[0], "contentWindow", { value: { postMessage }, configurable: true });

        controller.showCompiledDsp(node as unknown as Parameters<typeof controller.showCompiledDsp>[0]);

        expect(postMessage).toHaveBeenCalledWith({ path: "/gain", value: 0.75, type: "param" }, "*");
    });

    it("restores remembered state to an already-open Faust UI popup", () => {
        const popup = { postMessage: vi.fn(), close: vi.fn(), closed: false };
        const { controller } = bindController({
            uiEnv: { uiPopup: popup },
            options: {
                compileOptions: { saveParams: true, popup: true, args: [] },
                dspParams: { "/gain": 0.75 }
            }
        });
        const node = createNode();

        controller.showCompiledDsp(node as unknown as Parameters<typeof controller.showCompiledDsp>[0]);

        expect(popup.postMessage).toHaveBeenCalledWith({ type: "ui", ui: [{ type: "vslider" }] }, "*");
        expect(popup.postMessage).toHaveBeenCalledWith({ path: "/gain", value: 0.75, type: "param" }, "*");
    });

    it("mirrors incoming param messages to DSP and UI windows", () => {
        const popup = { postMessage: vi.fn(), close: vi.fn(), closed: false };
        const node = createNode();
        const postMessage = vi.fn();
        const { audioEnv, options } = bindController({ audioEnv: { dsp: node }, uiEnv: { uiPopup: popup } });
        Object.defineProperty($("#iframe-faust-ui")[0], "contentWindow", { value: { postMessage }, configurable: true });

        window.dispatchEvent(new MessageEvent("message", {
            data: { type: "param", path: "/gain", value: 0.75 },
            source: null
        }));

        expect(audioEnv.dsp.setParamValue).toHaveBeenCalledWith("/gain", 0.75);
        expect(options.dspParams["/gain"]).toBe(0.75);
        expect(options.saveDspParams).toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith({ path: "/gain", value: 0.75, type: "param" }, "*");
        expect(popup.postMessage).toHaveBeenCalledWith({ path: "/gain", value: 0.75, type: "param" }, "*");
    });

    it("handles GUI Builder export messages", async () => {
        const source = { postMessage: vi.fn() };
        const { options } = bindController();

        window.dispatchEvent(new MessageEvent("message", {
            data: { type: "export", plat: "web", arch: "wap" },
            source: source as unknown as WindowProxy
        }));
        await Promise.resolve();
        await Promise.resolve();

        expect(options.faustCompiler.expandDSP).toHaveBeenCalledWith("process = _;", "");
        expect(options.exportService.uploadAndPrecompile).toHaveBeenCalledWith({
            server: "https://service",
            file: expect.any(File),
            platform: "web",
            arch: "wap",
            chaosStratusInstallerForAnyArch: true
        });
        expect(source.postMessage).toHaveBeenCalledWith({ type: "exported", href: "https://exported" }, "*");
    });

    it("closes and destroys the current DSP from the close-tab button", () => {
        const gain = { disconnect: vi.fn() };
        const node = createNode();
        const popup = { postMessage: vi.fn(), close: vi.fn(), closed: false };
        const { audioEnv, uiEnv } = bindController({
            audioEnv: { dsp: node, gainInput: gain, dspConnectedToInput: true, dspConnectedToOutput: true },
            uiEnv: { uiPopup: popup }
        });

        $("#nav-item-faust-ui .btn-close-tab").trigger("click");

        expect(gain.disconnect).toHaveBeenCalledWith(node);
        expect(node.disconnect).toHaveBeenCalled();
        expect(node.destroy).toHaveBeenCalled();
        expect(audioEnv.dsp).toBeUndefined();
        expect(audioEnv.dspConnectedToInput).toBe(false);
        expect(audioEnv.dspConnectedToOutput).toBe(false);
        expect(popup.close).toHaveBeenCalled();
        expect(uiEnv.outputScope.disabled).toBe(true);
        expect($("#dsp-ui-default").html()).toBe("no DSP yet");
    });

    describe("probes", () => {
        const PROBE = { type: "hbargraph", label: "scope 1", address: "/main/scope_1", meta: [{ probe: "scope" }] };
        const createProbePanel = () => ({ attach: vi.fn(), detach: vi.fn(), setActive: vi.fn(), hasProbes: false });

        it("posts the UI without probes and hands the node to the probe panel", () => {
            const probePanel = createProbePanel();
            const { controller } = bindController({
                audioEnv: { audioCtx: { sampleRate: 44100 } },
                options: { probePanel }
            });
            probePanel.hasProbes = true;
            const node = createNode();
            node.getUI.mockReturnValue([{ type: "vgroup", label: "main", items: [{ type: "vslider", label: "gain" }, PROBE] }]);
            const postMessage = vi.fn();
            Object.defineProperty($("#iframe-faust-ui")[0], "contentWindow", { value: { postMessage }, configurable: true });
            $("#tab-probes").addClass("active");

            controller.showCompiledDsp(node as unknown as Parameters<typeof controller.showCompiledDsp>[0]);

            expect(postMessage).toHaveBeenCalledWith({ type: "ui", ui: [{ type: "vgroup", label: "main", items: [{ type: "vslider", label: "gain" }] }] }, "*");
            expect(probePanel.attach).toHaveBeenCalledWith(node, 44100);
            expect($("#nav-item-probes").css("display")).not.toBe("none");
            expect(probePanel.setActive).toHaveBeenLastCalledWith(true);
        });

        it("hides the Probes tab for a DSP without probes", () => {
            const probePanel = createProbePanel();
            const { controller } = bindController({
                audioEnv: { audioCtx: { sampleRate: 48000 } },
                options: { probePanel }
            });

            controller.showCompiledDsp(createNode() as unknown as Parameters<typeof controller.showCompiledDsp>[0]);

            expect($("#nav-item-probes").css("display")).toBe("none");
        });

        it("keeps the probe panel inactive when the Probes tab is not shown", () => {
            const probePanel = createProbePanel();
            const { controller } = bindController({
                audioEnv: { audioCtx: { sampleRate: 48000 } },
                options: { probePanel }
            });

            controller.showCompiledDsp(createNode() as unknown as Parameters<typeof controller.showCompiledDsp>[0]);

            expect(probePanel.setActive).toHaveBeenLastCalledWith(false);
        });

        it("follows the Probes tab: active when shown, inactive when hidden", () => {
            const probePanel = createProbePanel();
            bindController({ options: { probePanel } });

            $("#tab-probes").trigger("shown.bs.tab");
            expect(probePanel.setActive).toHaveBeenLastCalledWith(true);
            $("#tab-probes").trigger("hidden.bs.tab");
            expect(probePanel.setActive).toHaveBeenLastCalledWith(false);
        });

        it("removes the probes when the DSP is closed", () => {
            const probePanel = createProbePanel();
            bindController({ audioEnv: { dsp: createNode() }, options: { probePanel } });

            $("#nav-item-probes").show();
            $("#nav-item-faust-ui .btn-close-tab").trigger("click");

            expect(probePanel.detach).toHaveBeenCalled();
            expect($("#nav-item-probes").css("display")).toBe("none");
        });
    });
});
