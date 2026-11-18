/**
 * Captures microphone Float32 samples and posts little-endian PCM16 chunks to
 * the page. Running this in an AudioWorklet keeps the capture path off the UI
 * thread, which matters for live microphone routing.
 */
class PCM16CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunkSamples = Number(options?.processorOptions?.chunkSamples) || 1024;
    this.chunkSamples = Math.max(128, Math.min(8192, chunkSamples));
    this.buffer = new Int16Array(this.chunkSamples);
    this.offset = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'flush') {
        this.flush();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel || channel.length === 0) return true;

    for (let index = 0; index < channel.length; index += 1) {
      let sample = channel[index];
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;
      this.buffer[this.offset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.offset += 1;
      if (this.offset === this.chunkSamples) this.flush();
    }
    return true;
  }

  flush() {
    if (this.offset === 0) return;
    const output = this.buffer.slice(0, this.offset);
    this.port.postMessage({ type: 'pcm', buffer: output.buffer }, [output.buffer]);
    this.buffer = new Int16Array(this.chunkSamples);
    this.offset = 0;
  }
}

registerProcessor('pcm16-capture', PCM16CaptureProcessor);
