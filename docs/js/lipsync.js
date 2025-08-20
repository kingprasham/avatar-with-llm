// ES Module wrapper for OVR; falls back cleanly when SDK is missing.

const LipSync = {
  audioContext: null,
  ovr: null,             // { module, ctxHandle, create, process, destroy }
  processorNode: null,
  sourceNode: null,
  isInitialized: false,
  useRhubarbFallback: false,

  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      if (typeof window.createOVRLipSync === 'undefined') {
        throw new Error('OVR LipSync wrapper script not loaded.');
      }

      const module = await window.createOVRLipSync();
      const hasCwrap = typeof module.cwrap === 'function';

      const _create  = hasCwrap ? module.cwrap('ovrLipSync_CreateContext', 'number', ['number','number'])
                                : module._ovrLipSync_CreateContext;
      const _process = hasCwrap ? module.cwrap('ovrLipSync_ProcessFrame', 'number', ['number','number','number'])
                                : module._ovrLipSync_ProcessFrame;
      const _destroy = hasCwrap ? module.cwrap('ovrLipSync_DestroyContext', 'void',   ['number'])
                                : module._ovrLipSync_DestroyContext;

      if (!_create || !_process) {
        throw new Error('OVR functions not found in module.');
      }

      const ctxHandle = _create(0, this.audioContext.sampleRate);
      if (!ctxHandle) throw new Error('ovrLipSync_CreateContext failed (0).');

      this.ovr = { module, ctxHandle, create: _create, process: _process, destroy: _destroy };

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

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.sourceNode.start(0);
  },

  processAudio(e) {
    if (!this.ovr || !this.ovr.process || !this.ovr.ctxHandle) return;

    const input = e.inputBuffer.getChannelData(0);
    const len = input.length;
    const bytes = len * 4; // float32
    const ptr = this.ovr.module._malloc(bytes);
    this.ovr.module.HEAPF32.set(input, ptr >> 2);

    // Signature: int ovrLipSync_ProcessFrame(ctx, float* samples, int numSamples)
    this.ovr.process(this.ovr.ctxHandle, ptr, len);

    this.ovr.module._free(ptr);

    // TODO: get visemes from your wrapper if exposed, then:
    // window.Avatar?.updateVisemes(visemesArray);
  },

  stop() {
    if (this.processorNode) this.processorNode.disconnect();
    if (this.sourceNode) this.sourceNode.disconnect();
    // Safe reset if Avatar is present
    window.Avatar?.updateVisemes?.(new Array(15).fill(0));
  },

  destroy() {
    try {
      if (this.ovr?.destroy && this.ovr?.ctxHandle) this.ovr.destroy(this.ovr.ctxHandle);
    } finally {
      this.ovr = null;
      this.stop();
    }
  }
};

export default LipSync;
