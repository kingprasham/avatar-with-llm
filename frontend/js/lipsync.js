const LipSync = {
    audioContext: null,
    ovrContext: null,
    processorNode: null,
    isInitialized: false,
    useRhubarbFallback: false,
    
    // --- WASM Initialization ---
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (typeof createOVRLipSync === 'undefined') {
                throw new Error("OVR LipSync wrapper script not loaded.");
            }
            
            const context = await createOVRLipSync();
            this.ovrContext = context.ovrLipSync_CreateContext(0, this.audioContext.sampleRate);
            
            // Create a ScriptProcessorNode to process audio in real-time
            // Buffer size of 1024 is a good balance between latency and performance
            this.processorNode = this.audioContext.createScriptProcessor(1024, 1, 1);
            this.processorNode.onaudioprocess = this.processAudio.bind(this);
            
            this.isInitialized = true;
            console.log("OVR LipSync (WASM) initialized successfully.");
        } catch (error) {
            console.warn("OVR WASM LipSync initialization failed:", error);
            console.log("Switching to Rhubarb fallback.");
            this.useRhubarbFallback = true;
            this.isInitialized = true; // Mark as initialized to allow app to continue
        }
    },

    getAudioContext() {
        return this.audioContext;
    },

    // --- Real-time Processing (OVR WASM) ---
    start(audioBuffer) {
        if (!this.isInitialized || this.useRhubarbFallback) return;
        
        // Connect the processor node to the destination to start processing
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = audioBuffer;
        this.sourceNode.connect(this.processorNode);
        this.processorNode.connect(this.audioContext.destination);
    },

    processAudio(audioProcessingEvent) {
        if (!this.ovrContext) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Process the audio frame with OVR LipSync
        const result = this.ovrContext.ovrLipSync_ProcessFrame(this.ovrContext.context, inputData, inputData.length);
        
        if (result && result.visemes) {
            // Send the viseme scores to the avatar for animation
            Avatar.updateVisemes(result.visemes);
        }
    },

    stop() {
        if (this.processorNode) {
            this.processorNode.disconnect();
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
        }
        // Reset all visemes to silence
        Avatar.updateVisemes(new Array(15).fill(0));
    }
    
    // Note: The Rhubarb fallback is implicitly handled by the backend.
    // If useRhubarbFallback is true, this module does nothing, and the backend is expected
    // to provide a viseme timeline, which would require additional logic in app.js and avatar.js
    // to parse and animate based on timecodes. For simplicity in this implementation,
    // we focus on the primary real-time path. A full Rhubarb implementation would animate
    // `targetBlendshapeValues` in the main `animate()` loop based on `performance.now()`
    // against the received timeline.
};