// --- CONFIGURATION ---
const API_BASE_URL = 'https://coins-fairly-recreational-enforcement.trycloudflare.com';
const RECORDING_TIME_LIMIT = 15000; // 15 seconds max recording

// --- DOM ELEMENTS ---
const recordButton = document.getElementById('record-button');
const statusText = document.getElementById('status-text');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');

// --- STATE ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordingTimeout;
let sessionId = null;

// --- INITIALIZATION ---
window.addEventListener('load', async () => {
    try {
        updateLoadingStatus('Initializing Audio...');
        await setupAudio();
        updateLoadingStatus('Initializing Lip Sync...');
        await LipSync.init();
        updateLoadingStatus('Loading 3D Avatar...');
        await Avatar.init();
        updateLoadingStatus('Starting Session...');
        await startSession();
        loadingOverlay.style.display = 'none';
        recordButton.disabled = false;
        statusText.textContent = "Ready. Click the button to speak.";
    } catch (error) {
        console.error("Initialization failed:", error);
        statusText.textContent = `Error: ${error.message}. Please refresh the page.`;
        loadingStatus.textContent = `Initialization Failed: ${error.message}`;
        recordButton.disabled = true;
    }
});

async function setupAudio() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support audio recording.");
    }
    await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission early
}

async function startSession() {
    try {
        const response = await fetch(`${API_BASE_URL}/session/start`, { method: 'POST' });
        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
        const data = await response.json();
        sessionId = data.session_id;
        console.log("Session started:", sessionId);
    } catch (error) {
        console.error("Could not start session:", error);
        throw new Error("Could not connect to the server.");
    }
}

// --- CORE LOGIC ---
recordButton.addEventListener('click', () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

async function startRecording() {
    if (!sessionId) {
        statusText.textContent = "Session not started. Please refresh.";
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        mediaRecorder.onstop = processAudio;
        audioChunks = [];
        mediaRecorder.start();
        isRecording = true;
        recordButton.classList.add('recording');
        statusText.textContent = "Listening...";
        recordingTimeout = setTimeout(stopRecording, RECORDING_TIME_LIMIT);
    } catch (err) {
        console.error("Error starting recording:", err);
        statusText.textContent = "Could not start recording. Check microphone permissions.";
    }
}

function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    mediaRecorder.stop();
    isRecording = false;
    clearTimeout(recordingTimeout);
    recordButton.classList.remove('recording');
    statusText.textContent = "Processing...";
}

async function processAudio() {
    if (audioChunks.length === 0) {
        statusText.textContent = "No audio recorded. Try again.";
        return;
    }

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('session_id', sessionId);

    try {
        const startTime = performance.now();
        const response = await fetch(`${API_BASE_URL}/pipeline/voice`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) throw new Error(`Server returned status ${response.status}`);
        const data = await response.json();
        
        console.log("Pipeline Response:", data);
        const { audio_url, response_text } = data;
        statusText.textContent = `Avatar: "${response_text}"`;

        // Play the audio with lip-sync
        await playResponseAudio(audio_url);

    } catch (error) {
        console.error('Error processing audio pipeline:', error);
        statusText.textContent = "An error occurred. Please try again.";
    } finally {
        // Reset for next turn
        setTimeout(() => {
            if (!isRecording) {
                statusText.textContent = "Ready. Click the button to speak.";
            }
        }, 1000);
    }
}

async function playResponseAudio(url) {
    try {
        const audioContext = LipSync.getAudioContext();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // --- LIP SYNC PREPARATION ---
        LipSync.start(audioBuffer);

        // --- AUDIO PLAYBACK with PREROLL ---
        // This slight delay allows the visemes to start animating just before the sound is heard,
        // compensating for the time it takes for sound to travel and be perceived.
        const AUDIO_PREROLL_MS = 70;
        setTimeout(() => {
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0);

            source.onended = () => {
                LipSync.stop();
                console.log("Audio playback finished.");
            };
        }, AUDIO_PREROLL_MS);

    } catch (error) {
        console.error('Error playing response audio:', error);
        statusText.textContent = "Could not play response audio.";
        LipSync.stop(); // Ensure lip-sync stops on error
    }
}

function updateLoadingStatus(message) {
    if (loadingStatus) {
        loadingStatus.textContent = message;
    }
}