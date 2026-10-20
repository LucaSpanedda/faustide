// Plucked string: press the button
import("stdfaust.lib");

freq = hslider("Frequency [unit:Hz]", 220, 50, 1000, 0.1);
damp = hslider("Damping", 0.5, 0, 1, 0.01);
pluck = button("Pluck");

process = pm.ks(pm.f2l(freq), damp, pluck * 0.5) <: _, _;
