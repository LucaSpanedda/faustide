// Microphone into a feedback delay (use headphones: the speaker can feed back)
import("stdfaust.lib");

time = hslider("Time [unit:ms]", 350, 10, 2000, 1) : si.smoo;
fb = hslider("Feedback", 0.5, 0, 0.95, 0.01) : si.smoo;
mix = hslider("Mix", 0.5, 0, 1, 0.01) : si.smoo;

echo = + ~ (de.sdelay(ma.SR * 2, 1024, time * ma.SR / 1000) * fb);
process = _ <: _ * (1 - mix) + echo * mix <: _, _;
