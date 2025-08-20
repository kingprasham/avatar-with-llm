// js/lipsync.js (ESM)
// Robust: works with a real OVR Web/WASM build if you add it,
// otherwise uses amplitude-based fallback (no SDK needed).

const LipSync = {
  audioContext: null,

  // OVR path
  ovr: null,                 // { module, ctxHandle, create, process, destroy }
  processorNode: null,       // ScriptProcessorNode for OVR path
  ovrSourceNode: null,       // analysis source for OVR path

  // Amplitude fallback path
  useAmplitudeFallback: false,
  analyser: null,
  analyserBuf: null,
  rafId: null,

  isInitialized: false,

  async init() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    try {
      if (typeof window.createOVRLipSync === 'undefined') {
        throw new Error('OVR LipSync wrapper script not loaded (placeholder detected).');
      }

      const module = await window.createOVRLipSync();
      const hasCwrap = typeof module.cwrap === 'function';

      const _create  = hasCwrap ? module.cwrap('ovrLipSync_CreateContext', 'number', ['number','number'])
                                : module._ovrLipSync_CreateContext;
      const _process = hasCwrap ? module.cwrap('ovrLipSync_ProcessFrame', 'number', ['number','number','number'])
                                : module._ovrLipSync_ProcessFrame;
      const _destroy = hasCwrap ? module.cwrap('ovrLipSync_DestroyContext', 'void',   ['number'])
                                : module._ovrLipSync_DestroyContext;

      if (!_create || !_process) throw new Error('OVR functions not found in module.');

      const ctxHandle = _create(0, this.audioContext.sampleRate);
      if (!ctxHandle) throw new Error('ovrLipSync_CreateContext failed (0).');

      this.ovr = { module, ctxHandle, create: _create, process: _process, destroy: _destroy };

      // Create a processor that will pull the graph
      this.processorNode = this.audioContext.createScriptProcessor(1024, 1, 1);
      this.processorNode.onaudioprocess = this._processOVR.bind(this);

      console.log('OVR LipSync (WASM) initialized.');
    } catch (err) {
      console.warn('OVR LipSync not available — using amplitude-based fallback.', err);
      this.useAmplitudeFallback = true;
    } finally {
      this.isInitialized = true;
    }
  },

  getAudioContext() { return this.audioContext; },

  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  },

  /**
   * Called by app.js BEFORE playback; sets up OVR analysis. For amplitude fallback we don’t need a separate source here.
   */
  start(audioBuffer) {
    if (!this.isInitialized) return;

    if (this.useAmplitudeFallback) {
      // No-op here; we’ll attach to the real playback source in attachToSource()
      return;
    }

    // OVR path: create a silent analysis chain to feed the processor
    this._disconnectOVR();

    this.ovrSourceNode = this.audioContext.createBufferSource();
    this.ovrSourceNode.buffer = audioBuffer;

    // source -> processor -> destination (silent output, but needed to clock the processor)
    this.ovrSourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    // Start the analysis source now; app.js will start audible playback separately with a tiny preroll
    this.ovrSourceNode.start(0);
  },

  /**
   * Attach to the actual playback source so amplitude fallback can read live audio.
   * Safe to call even in OVR mode (it will no-op there).
   */
  attachToSource(playbackSourceNode) {
    if (!this.isInitialized) return;

    if (!this.useAmplitudeFallback) {
      // Using OVR — analysis already running via ScriptProcessor
      return;
    }

    // Create (or reuse) analyser
    if (!this.analyser) {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyserBuf = new Float32Array(this.analyser.fftSize);
    }

    // Fan out: playback source -> destination (in app.js) AND -> analyser (here)
    // It's okay to connect the same node to multiple outputs.
    playbackSourceNode.connect(this.analyser);

    // Start a RAF loop to compute RMS and drive jawOpen
    this._startAmplitudeLoop();
  },

  _startAmplitudeLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);

    const smooth = { val: 0 }; // simple one-pole smoother

    const tick = () => {
      if (!this.analyser || !this.analyserBuf) return;

      this.analyser.getFloatTimeDomainData(this.analyserBuf);

      // Compute RMS (root-mean-square)
      let sum = 0;
      for (let i = 0; i < this.analyserBuf.length; i++) {
        const x = this.analyserBuf[i];
        sum += x * x;
      }
      const rms = Math.sqrt(sum / this.analyserBuf.length);

      // Map RMS (~0..~0.3 for typical speech) to 0..1
      // Tweak thresholds as desired
      const min = 0.015;  // noise floor
      const max = 0.2;    // loud speech
      let level = (rms - min) / (max - min);
      level = Math.max(0, Math.min(1, level));

      // Smooth (attack faster than release)
      const coeff = level > smooth.val ? 0.35 : 0.5;
      smooth.val = smooth.val + (level - smooth.val) * coeff;

      // Drive jawOpen directly
      window.Avatar?.updateVisemes?.({ jawOpen: smooth.val });

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  },

  _processOVR(e) {
    // Only runs if OVR is present
    if (!this.ovr?.process || !this.ovr?.ctxHandle) return;

    const input = e.inputBuffer.getChannelData(0);
    const len = input.length;
    const bytes = len * 4; // float32
    const ptr = this.ovr.module._malloc(bytes);
    this.ovr.module.HEAPF32.set(input, ptr >> 2);

    // int ovrLipSync_ProcessFrame(ctx, float* samples, int numSamples)
    this.ovr.process(this.ovr.ctxHandle, ptr, len);

    this.ovr.module._free(ptr);

    // TODO: fetch visemes from your wrapper and forward to Avatar.updateVisemes([...])
    // This depends on your specific OVR WASM build (shared buffer or a getter).
  },

  stop() {
    // Stop amplitude loop
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Disconnect analyser
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch {}
    }

    // Reset jaw
    window.Avatar?.updateVisemes?.({ jawOpen: 0 });

    // Tear down OVR chain
    this._disconnectOVR();
  },

  _disconnectOVR() {
    try {
      if (this.ovrSourceNode) { this.ovrSourceNode.stop(); this.ovrSourceNode.disconnect(); }
      if (this.processorNode) { this.processorNode.disconnect(); }
    } catch {}
    this.ovrSourceNode = null;
  },

  destroy() {
    this.stop();
    try {
      if (this.ovr?.destroy && this.ovr?.ctxHandle) this.ovr.destroy(this.ovr.ctxHandle);
    } finally {
      this.ovr = null;
    }
  }
};

export default LipSync;
