import { ProbeNumberView } from "./ProbeNumberView";
import { ProbePhaseView } from "./ProbePhaseView";
import { ProbeRecView } from "./ProbeRecView";
import { ProbeScopeView } from "./ProbeScopeView";
import { ProbeFftView, ProbeSpectrogramView } from "./ProbeSpectrumViews";
import type { ProbeView, ProbeViewOptions } from "./ProbeView";

/**
 * Builds the view of a probe, according to its kind.
 *
 * @param options the probe, its histories and the panel's callbacks
 * @returns the built view, its DOM ready to be appended
 */
export const createProbeView = (options: ProbeViewOptions): ProbeView => {
    switch (options.probe.kind) {
        case "phase":
            return new ProbePhaseView(options).build();
        case "fft":
            return new ProbeFftView(options).build();
        case "spectrogram":
            return new ProbeSpectrogramView(options).build();
        case "number":
            return new ProbeNumberView(options).build();
        case "rec":
            return new ProbeRecView(options).build();
        default:
            return new ProbeScopeView(options).build();
    }
};
