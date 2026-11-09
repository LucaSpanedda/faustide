/**
 * The recent past of one probe signal: a ring buffer of samples.
 *
 * The DSP node hands the probes over block by block; a view reads, whenever it
 * redraws, the last N samples as one contiguous array. Writing and reading are
 * decoupled, so a slow redraw rate never loses samples, it only skips frames
 * of the drawing. DOM-free.
 */
export class ProbeHistory {
    private readonly buffer: Float32Array;
    /** Where the next sample goes */
    private head = 0;
    /** How many samples were ever written, saturated at the capacity */
    private filled = 0;

    /**
     * @param capacity the longest stretch of signal that can be read back, in samples
     */
    constructor(capacity: number) {
        this.buffer = new Float32Array(Math.max(1, Math.floor(capacity)));
    }

    get capacity() {
        return this.buffer.length;
    }

    /** Number of samples that can be read back, up to the capacity. */
    get length() {
        return this.filled;
    }

    /** Appends a block of samples. */
    push(block: ArrayLike<number>) {
        const { buffer } = this;
        for (let i = 0; i < block.length; i++) {
            buffer[this.head] = block[i];
            this.head = (this.head + 1) % buffer.length;
        }
        this.filled = Math.min(buffer.length, this.filled + block.length);
    }

    /**
     * Copies the most recent samples, oldest first, into `out`, filling it
     * entirely: what was never written reads as 0.
     *
     * @param out the destination, whose length is the number of samples read;
     * it cannot exceed the capacity
     * @returns `out`
     */
    read(out: Float32Array) {
        const { buffer } = this;
        if (out.length > buffer.length) throw new RangeError(`Cannot read ${out.length} samples from a history of ${buffer.length}`);
        const missing = out.length - Math.min(out.length, this.filled);
        out.fill(0, 0, missing);
        for (let i = missing; i < out.length; i++) {
            const age = out.length - i;
            out[i] = buffer[(this.head - age + buffer.length) % buffer.length];
        }
        return out;
    }

    /** Forgets every sample. */
    clear() {
        this.buffer.fill(0);
        this.head = 0;
        this.filled = 0;
    }
}
