const API_BASE_URL = 'https://your-cloudflare-tunnel-url.trycloudflare.com'; // IMPORTANT: REPLACE
const RECORDING_TIME_LIMIT = 15000;

const recordButton = document.getElementById('record-button');
const statusText = document.getElementById('status-text');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');

let mediaRecorder, audioChunks = [], isRecording = false, recordingTimeout, sessionId = null;

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
        statusText.textContent = `Error: ${error.message}. Please refresh.`;
        loadingStatus.textContent = `Initialization Failed: ${error.message}`;
        recordButton.disabled = true;
    }
});

async function setupAudio() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Audio recording not supported.");
    await navigator.mediaDevices.getUserMedia({ audio: true });
}

async function startSession() {
    try {
        const response = await fetch(`${API_BASE_URL}/session/start`, { method: 'POST' });
        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
        const data = await response.json();
        sessionId = data.session_id;
        console.log("Session started:", sessionId);
    } catch (error) {
        throw new Error("Could not connect to the server.");
    }
}

recordButton.addEventListener('click', () => { isRecording ? stopRecording() : startRecording(); });

async function startRecording() {
    if (!sessionId) { statusText.textContent = "Session not started. Refresh."; return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = processAudio;
        audioChunks = [];
        mediaRecorder.start();
        isRecording = true;
        recordButton.classList.add('recording');
        statusText.textContent = "Listening...";
        recordingTimeout = setTimeout(stopRecording, RECORDING_TIME_LIMIT);
    } catch (err) {
        statusText.textContent = "Could not start recording. Check mic permissions.";
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
    if (audioChunks.length === 0) { statusText.textContent = "No audio recorded."; return; }
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('session_id', sessionId);

    try {
        const response = await fetch(`${API_BASE_URL}/pipeline/voice`, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Server returned status ${response.status}`);
        const data = await response.json();
        statusText.textContent = `Avatar: "${data.response_text}"`;
        await playResponseAudio(data.audio_url);
    } catch (error) {
        console.error('Error in pipeline:', error);
        statusText.textContent = "An error occurred. Please try again.";
    } finally {
        setTimeout(() => { if (!isRecording) statusText.textContent = "Ready."; }, 1000);
    }
}

async function playResponseAudio(url) {
    try {
        const audioContext = LipSync.getAudioContext();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        LipSync.start(audioBuffer);
        const AUDIO_PREROLL_MS = 70;
        setTimeout(() => {
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0);
            source.onended = () => LipSync.stop();
        }, AUDIO_PREROLL_MS);
    } catch (error) {
        console.error('Error playing audio:', error);
        statusText.textContent = "Could not play response.";
        LipSync.stop();
    }
}

function updateLoadingStatus(message) { if (loadingStatus) loadingStatus.textContent = message; }