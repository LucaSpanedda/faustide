// Duffing oscillator - parameters for chaotic regime (Luca Spanedda)
import("stdfaust.lib");

duffing = f ~ si.bus(2)
with {
    f(x, y) = x + (y * dt) + initX,
              y + ((-delta * y - alpha * x - beta * x * x * x +
              gamma * cos(omega * time)) * dt) + initY;
    dt = 0.01;
    delta = 0.2;
    alpha = -1.0;
    beta = 1.0;
    gamma = 0.3;
    omega = 1.0;
    time = (+ (dt) ~ _);
    x0 = 0.1;
    y0 = 0.2;
    initX = x0 - mem(x0);
    initY = y0 - mem(y0);
};

process = duffing : par(i, 2, _ * 0.5);
