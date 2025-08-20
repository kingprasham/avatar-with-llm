const LipSync = {
    audioContext: null, ovrContext: null, processorNode: null, sourceNode: null,
    isInitialized: false, useRhubarbFallback: false,
    
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (typeof createOVRLipSync === 'undefined') {
                throw new Error("OVR LipSync wrapper script not loaded.");
            }
            const context = await createOVRLipSync();
            // THE FIX IS ON THE NEXT LINE
            this.ovrContext = context.ovrLipSync_CreateContext(0, this.audioContext.sampleRate);
            this.processorNode = this.audioContext.createScriptProcessor(1024, 1, 1);
            this.processorNode.onaudioprocess = this.processAudio.bind(this);
            this.isInitialized = true;
            console.log("OVR LipSync (WASM) initialized.");
        } catch (error) {
            console.warn("OVR WASM LipSync failed:", error);
            console.log("Switching to Rhubarb fallback.");
            this.useRhubarbFallback = true;
            this.isInitialized = true;
        }
    },

    getAudioContext() { return this.audioContext; },

    start(audioBuffer) {
        if (!this.isInitialized || this.useRhubarbFallback) return;
        if (this.sourceNode) this.sourceNode.disconnect();
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = audioBuffer;
        this.sourceNode.connect(this.processorNode);
        this.processorNode.connect(this.audioContext.destination);
    },

    processAudio(audioProcessingEvent) {
        if (!this.ovrContext) return;
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        const result = this.ovrContext.ovrLipSync_ProcessFrame(this.ovrContext.context, inputData, inputData.length);
        if (result && result.visemes) Avatar.updateVisemes(result.visemes);
    },

    stop() {
        if (this.processorNode) this.processorNode.disconnect();
        if (this.sourceNode) this.sourceNode.disconnect();
        Avatar.updateVisemes(new Array(15).fill(0));
    }
};