// Sine oscillator with frequency and level
import("stdfaust.lib");

freq = hslider("Frequency [unit:Hz]", 440, 50, 2000, 0.1) : si.smoo;
gain = hslider("Level [unit:dB]", -20, -60, 0, 0.1) : ba.db2linear : si.smoo;

process = os.osc(freq) * gain <: _, _;
