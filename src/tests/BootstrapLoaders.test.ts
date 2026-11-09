import { beforeEach, describe, expect, it, vi } from "vitest";

const fileSystem = { writeFile: vi.fn() };
const libFaust = {
    version: vi.fn(() => "2.79.3"),
    fs: vi.fn(() => fileSystem)
};
const instantiateFaustModuleFromFile = vi.fn(async () => ({ wasm: true }));
const LibFaust = vi.fn(function LibFaust() {
    return libFaust;
});
const FaustCompiler = vi.fn(function FaustCompiler() {});
const FaustSvgDiagrams = vi.fn(function FaustSvgDiagrams() {});

vi.mock("@grame/faustwasm", () => ({
    instantiateFaustModuleFromFile,
    LibFaust,
    FaustCompiler,
    FaustSvgDiagrams
}));

describe("BootstrapLoaders", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("loads libfaust, reports its version, and installs primitives.lib and probes.lib", async () => {
        const fetchMock = vi.fn(async (url: string) => ({ text: async () => `declare name "${url}";` }));
        vi.stubGlobal("fetch", fetchMock);
        const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
        const { loadFaustRuntime } = await import("../runtime/BootstrapLoaders");

        const runtime = await loadFaustRuntime();

        expect(instantiateFaustModuleFromFile).toHaveBeenCalledWith("faustwasm/libfaust-wasm.js");
        expect(consoleInfo).toHaveBeenCalledWith("libfaust version: 2.79.3");
        expect(fetchMock).toHaveBeenCalledWith("primitives.lib");
        expect(fileSystem.writeFile).toHaveBeenCalledWith("/usr/share/faust/primitives.lib", "declare name \"primitives.lib\";");
        expect(fetchMock).toHaveBeenCalledWith("probes.lib");
        expect(fileSystem.writeFile).toHaveBeenCalledWith("/usr/share/faust/probes.lib", "declare name \"probes.lib\";");
        expect(runtime.libFaust).toBe(libFaust);
    });
});
