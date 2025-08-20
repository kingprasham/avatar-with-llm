// js/lipsync.js
// Global singleton style to match your app.js usage of `LipSync`
const LipSync = {
  audioContext: null,
  ovr: null, // will hold functions and the native context handle
  processorNode: null,
  sourceNode: null,
  isInitialized: false,
  useRhubarbFallback: false,

  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      if (typeof createOVRLipSync === 'undefined') {
        throw new Error('OVR LipSync wrapper script not loaded.');
      }

      // Load the WASM module/wrapper
      const module = await createOVRLipSync();

      // Prefer cwrap (clean JS function wrappers)
      const hasCwrap = typeof module.cwrap === 'function';
      const _create   = hasCwrap ? module.cwrap('ovrLipSync_CreateContext', 'number', ['number','number'])
                                 : module._ovrLipSync_CreateContext;
      const _process  = hasCwrap ? module.cwrap('ovrLipSync_ProcessFrame', 'number', ['number','number','number'])
                                 : module._ovrLipSync_ProcessFrame;
      const _destroy  = hasCwrap ? module.cwrap('ovrLipSync_DestroyContext', 'void',   ['number'])
                                 : module._ovrLipSync_DestroyContext;

      if (!_create || !_process) {
        throw new Error('OVR functions not found in module.');
      }

      // Create native context handle
      const ctxHandle = _create(0, this.audioContext.sampleRate);
      if (!ctxHandle) {
        throw new Error('ovrLipSync_CreateContext failed (returned 0).');
      }

      // Keep references organized
      this.ovr = {
        module,
        ctxHandle,
        create: _create,
        process: _process,
        destroy: _destroy
      };

      // Create a processor node to pull mic/buffer audio through
      this.processorNode = this.audioContext.createScriptProcessor(1024, 1, 1);
      this.processorNode.onaudioprocess = this.processAudio.bind(this);

      this.isInitialized = true;
      console.log('OVR LipSync (WASM) initialized.');
    } catch (error) {
      console.warn('OVR WASM LipSync failed:', error);
      console.log('Switching to Rhubarb fallback.');
      this.useRhubarbFallback = true;
      this.isInitialized = true; // allow the rest of the app to continue
    }
  },

  getAudioContext() { return this.audioContext; },

  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  },

  start(audioBuffer) {
    if (!this.isInitialized || this.useRhubarbFallback) return;

    if (this.sourceNode) this.sourceNode.disconnect();
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = audioBuffer;

    // Connect: source → processor → (destination, or keep silent if you only want analysis)
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.sourceNode.start(0);
  },

  processAudio(e) {
    // Guard if OVR isn’t available
    if (!this.ovr || !this.ovr.process || !this.ovr.ctxHandle) return;

    const input = e.inputBuffer.getChannelData(0);

    // Allocate WASM heap memory for input samples
    const len = input.length;
    const bytes = len * 4; // float32
    const ptr = this.ovr.module._malloc(bytes);
    this.ovr.module.HEAPF32.set(input, ptr >> 2);

    // Call into WASM
    // Typical signature: int ovrLipSync_ProcessFrame(ctx, float* samples, int numSamples)
    const ret = this.ovr.process(this.ovr.ctxHandle, ptr, len);

    // Free memory
    this.ovr.module._free(ptr);

    // If your wrapper exposes a way to fetch visemes (e.g., a shared buffer or another getter),
    // retrieve them here. For demo, we’ll just no-op if nothing is available.
    // Example (pseudo):
    // const visemesPtr = this.ovr.module._ovrLipSync_GetVisemes(this.ovr.ctxHandle);
    // const visemes = new Float32Array(this.ovr.module.HEAPF32.buffer, visemesPtr, 15);
    // Avatar.updateVisemes(Array.from(visemes));

    // Fallback: if your wrapper returns visemes directly somehow, adapt here.
    // For now, do nothing unless you wire the actual accessor.
  },

  stop() {
    if (this.processorNode) this.processorNode.disconnect();
    if (this.sourceNode) this.sourceNode.disconnect();
    if (typeof Avatar !== 'undefined' && Avatar.updateVisemes) {
      Avatar.updateVisemes(new Array(15).fill(0));
    }
  },

  destroy() {
    try {
      if (this.ovr?.destroy && this.ovr?.ctxHandle) {
        this.ovr.destroy(this.ovr.ctxHandle);
      }
    } finally {
      this.ovr = null;
      this.stop();
    }
  }
};

// Expose globally (your app.js expects a global LipSync)
window.LipSync = LipSync;
