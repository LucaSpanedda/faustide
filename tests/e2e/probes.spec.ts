import { expect, Page, test } from "@playwright/test";
import { openApp, runDsp, setEditorCode } from "./helpers";

// One probe of each kind on a running oscillator
const ALL_PROBES = `import("stdfaust.lib");
pr = library("probes.lib");
osc = os.osc(441) : pr.scope(1) : pr.number(1) : pr.fft(1) : pr.spectrogram(1) : pr.rec(1);
process = osc, os.osc(662) : pr.phase(1) :> *(0.25);`;

/** Counts the lit pixels of the canvas of the probe view with that address. */
const litPixels = (page: Page, address: string) => page.evaluate((key) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`.probe-view[data-address="${key}"] canvas`);
    const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) lit++;
    return lit;
}, address);

test.describe("Probes", () => {
    test("shows the Probes tab only for a DSP with probes, one view per probe, sorted", async ({ page }) => {
        await openApp(page);
        await setEditorCode(page, "import(\"stdfaust.lib\");\nprocess = os.osc(441) * 0.25;");
        await runDsp(page);
        await expect(page.locator("#nav-item-probes")).toBeHidden();

        await setEditorCode(page, ALL_PROBES);
        await runDsp(page);
        await expect(page.locator("#nav-item-probes")).toBeVisible();
        await page.locator("#tab-probes").click();
        // Sorted by kind, then number; a phase pair is one view
        await expect(page.locator(".probe-view .probe-name")).toHaveCount(6);
        const names = await page.locator(".probe-view .probe-name").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
        expect(names).toEqual(["scope 1", "phase 1", "fft 1", "spectrogram 1", "number 1", "rec 1"]);
    });

    test("draws the probed signal while the Probes tab is shown", async ({ page }) => {
        await openApp(page);
        await setEditorCode(page, ALL_PROBES);
        await runDsp(page);
        await page.locator("#tab-probes").click();
        const scope = await page.locator(".probe-view-scope").getAttribute("data-address");
        await expect.poll(() => litPixels(page, scope)).toBeGreaterThan(50);
        await expect(page.locator(".probe-view-number canvas")).toBeVisible();
    });

    test("records a probe and downloads it as a WAV file", async ({ page }) => {
        await openApp(page);
        await setEditorCode(page, ALL_PROBES);
        await runDsp(page);
        await page.locator("#tab-probes").click();
        const rec = page.locator(".probe-view-rec canvas");
        await rec.click();
        await expect(page.locator(".probe-view-rec .probe-record")).toHaveClass(/active/);
        // A genuinely time-based signal: record for a moment
        await page.waitForTimeout(500);
        const [download] = await Promise.all([page.waitForEvent("download"), rec.click()]);
        expect(download.suggestedFilename()).toMatch(/^untitled-rec_1-\d{8}-\d{6}\.wav$/);
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk as Buffer);
        const wav = Buffer.concat(chunks);
        expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
        // Mono, and longer than its header: samples were recorded
        expect(wav.readUInt16LE(22)).toBe(1);
        expect(wav.length).toBeGreaterThan(44 + 1000);
    });
});
