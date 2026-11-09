import { drawCanvasBackground } from "../CanvasDrawing";
import { formatScopeValue } from "./ProbeScopeRenderer";
import type { ProbeScopeRange } from "./ProbeScopeRenderer";

/**
 * Phase portrait drawing for phase probes: one signal against another (x, y)
 * in a square centred in the canvas. Pure functions over a canvas context.
 */

/**
 * Returns the half-side of the drawn square in signal units: the fixed range,
 * or for "auto" the peak of both signals, never 0.
 */
export const phaseHalfRange = (x: Float32Array, y: Float32Array, range: ProbeScopeRange) => {
    if (range !== "auto") return range;
    let peak = 0;
    for (const signal of [x, y]) {
        for (let i = 0; i < signal.length; i++) {
            const magnitude = Math.abs(signal[i]);
            if (magnitude > peak && Number.isFinite(magnitude)) peak = magnitude;
        }
    }
    return peak > 0 ? peak : 1;
};

/** The square the portrait is drawn in, centred in the canvas. */
const plotSquare = (width: number, height: number) => {
    const side = Math.min(width, height);
    return { left: (width - side) / 2, top: (height - side) / 2, side };
};

/**
 * Returns the signal values (x, y) at a point of the canvas.
 *
 * @param cursorX horizontal position in device pixels
 * @param cursorY vertical position in device pixels
 * @param width canvas width in device pixels
 * @param height canvas height in device pixels
 * @param halfRange the value at the edges of the square
 */
export const readPhaseCursor = (cursorX: number, cursorY: number, width: number, height: number, halfRange: number) => {
    const { left, top, side } = plotSquare(width, height);
    return {
        x: ((cursorX - left) / side * 2 - 1) * halfRange,
        y: (1 - (cursorY - top) / side * 2) * halfRange
    };
};

/**
 * Draws one phase portrait.
 *
 * @param ctx the canvas context
 * @param width canvas width in device pixels
 * @param height canvas height in device pixels
 * @param x the horizontal signal, oldest first
 * @param y the vertical signal, as long as x
 * @param halfRange the value at the edges of the square
 * @param caption text written in the bottom-right corner
 * @param options pixel ratio and cursor position in device pixels
 */
export const drawProbePhase = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    x: Float32Array,
    y: Float32Array,
    halfRange: number,
    caption: string,
    options: { pixelRatio?: number; cursor?: { x: number; y: number } } = {}
) => {
    const { pixelRatio = 1, cursor } = options;
    const { left, top, side } = plotSquare(width, height);
    drawCanvasBackground(ctx, width, height, "#000000");

    // Frame, quarters and axes
    ctx.save();
    ctx.lineWidth = pixelRatio;
    ctx.strokeStyle = "#303030";
    ctx.beginPath();
    for (const ratio of [0, 0.25, 0.75, 1]) {
        ctx.moveTo(left + side * ratio, top);
        ctx.lineTo(left + side * ratio, top + side);
        ctx.moveTo(left, top + side * ratio);
        ctx.lineTo(left + side, top + side * ratio);
    }
    ctx.stroke();
    ctx.strokeStyle = "#505050";
    ctx.beginPath();
    ctx.moveTo(left + side / 2, top);
    ctx.lineTo(left + side / 2, top + side);
    ctx.moveTo(left, top + side / 2);
    ctx.lineTo(left + side, top + side / 2);
    ctx.stroke();
    ctx.restore();

    // Trace, clipped to the square
    const toX = (value: number) => left + side / 2 + Math.max(-1, Math.min(1, value / halfRange)) * side / 2;
    const toY = (value: number) => top + side / 2 - Math.max(-1, Math.min(1, value / halfRange)) * side / 2;
    const length = Math.min(x.length, y.length);
    if (length) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = pixelRatio;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i < length; i++) {
            if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
            if (i === 0) ctx.moveTo(toX(x[i]), toY(y[i]));
            else ctx.lineTo(toX(x[i]), toY(y[i]));
        }
        ctx.stroke();
        ctx.restore();
    }

    // Range and caption
    ctx.save();
    ctx.font = `${10 * pixelRatio}px monospace`;
    ctx.fillStyle = "#909090";
    ctx.textBaseline = "top";
    ctx.fillText(`±${formatScopeValue(halfRange)}`, 4 * pixelRatio, 3 * pixelRatio);
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    ctx.fillText(caption, width - 4 * pixelRatio, height - 3 * pixelRatio);
    ctx.restore();

    // Cursor: crosshair and the (x, y) values under it
    if (!cursor) return;
    const value = readPhaseCursor(cursor.x, cursor.y, width, height, halfRange);
    ctx.save();
    ctx.strokeStyle = "#ffffa0";
    ctx.lineWidth = pixelRatio;
    ctx.setLineDash([2 * pixelRatio, 2 * pixelRatio]);
    ctx.beginPath();
    ctx.moveTo(Math.round(cursor.x) + 0.5, top);
    ctx.lineTo(Math.round(cursor.x) + 0.5, top + side);
    ctx.moveTo(left, Math.round(cursor.y) + 0.5);
    ctx.lineTo(left + side, Math.round(cursor.y) + 0.5);
    ctx.stroke();
    ctx.font = `${11 * pixelRatio}px monospace`;
    ctx.fillStyle = "#ffffa0";
    ctx.textBaseline = "top";
    ctx.textAlign = cursor.x < width / 2 ? "left" : "right";
    const labelX = cursor.x + (cursor.x < width / 2 ? 5 : -5) * pixelRatio;
    ctx.fillText(`x ${formatScopeValue(value.x)}`, labelX, 3 * pixelRatio);
    ctx.fillText(`y ${formatScopeValue(value.y)}`, labelX, 16 * pixelRatio);
    ctx.restore();
};
