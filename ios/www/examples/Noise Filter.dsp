// Pink noise through a resonant low-pass filter
import("stdfaust.lib");

cutoff = hslider("Cutoff [unit:Hz] [scale:log]", 1000, 50, 10000, 1) : si.smoo;
q = hslider("Resonance", 2, 0.5, 20, 0.01) : si.smoo;
gain = hslider("Level [unit:dB]", -18, -60, 0, 0.1) : ba.db2linear : si.smoo;

process = no.pink_noise : fi.resonlp(cutoff, q, 1) * gain <: _, _;
