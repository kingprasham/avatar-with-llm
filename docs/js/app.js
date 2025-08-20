// js/app.js
import LipSync from './lipsync.js';
import Avatar from './avatar.js';

// ======= CONFIG =======
const DEMO_MODE = true; // <-- set to false once your API is live
const API_BASE_URL = 'https://your-real-endpoint.example.com'; // <-- replace when DEMO_MODE = false
const SAMPLE_AUDIO_URL = 'assets/audio/sample.mp3'; // <-- put a short speech file here
const RECORDING_TIME_LIMIT = 15000;
// ======================

const recordButton   = document.getElementById('record-button');
const playSampleBtn  = document.getElementById('play-sample');
const statusText     = document.getElementById('status-text');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus  = document.getElementById('loading-status');

let mediaRecorder, audioChunks = [], isRecording = false, recordingTimeout, sessionId = null;

window.addEventListener('load', async () => {
  try {
    updateLoadingStatus('Initializing Audio...');
    await setupAudio();

    updateLoadingStatus('Initializing Lip Sync...');
    await LipSync.init();

    updateLoadingStatus('Loading 3D Avatar...');
    await Avatar.init();

    if (!DEMO_MODE) {
      updateLoadingStatus('Starting Session...');
      await startSession();
    }

    loadingOverlay.style.display = 'none';
    recordButton.disabled = false;
    playSampleBtn.disabled = false;
    statusText.textContent = DEMO_MODE
      ? 'Demo mode: click Play Sample or use the mic.'
      : 'Ready. Click the mic to speak.';
  } catch (error) {
    console.error('Initialization failed:', error);
    statusText.textContent = `Error: ${error.message || error}`;
    if (loadingStatus) loadingStatus.textContent = `Initialization Failed: ${error.message || error}`;
    recordButton.disabled = true;
    playSampleBtn.disabled = true;
  }
});

async function setupAudio() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Audio recording not supported.');
  await navigator.mediaDevices.getUserMedia({ audio: true });
}

async function startSession() {
  const response = await fetch(`${API_BASE_URL}/session/start`, { method: 'POST' });
  if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
  const data = await response.json();
  sessionId = data.session_id;
  console.log('Session started:', sessionId);
}

recordButton.addEventListener('click', async () => {
  await LipSync.resume();
  isRecording ? stopRecording() : startRecording();
});

playSampleBtn.addEventListener('click', async () => {
  await LipSync.resume();
  statusText.textContent = 'Playing sample...';
  try {
    await playResponseAudio(SAMPLE_AUDIO_URL);
    statusText.textContent = 'Done.';
  } catch (e) {
    console.error(e);
    statusText.textContent = 'Could not play sample.';
  }
});

async function startRecording() {
  if (!DEMO_MODE && !sessionId) {
    statusText.textContent = 'Session not started. Refresh.';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = DEMO_MODE ? playBackLocalRecording : processAudioToServer;

    mediaRecorder.start();
    isRecording = true;
    recordButton.classList.add('recording');
    statusText.textContent = 'Listening...';
    recordingTimeout = setTimeout(stopRecording, RECORDING_TIME_LIMIT);
  } catch (err) {
    console.error(err);
    statusText.textContent = 'Could not start recording. Check mic permissions.';
  }
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.stop();
  isRecording = false;
  clearTimeout(recordingTimeout);
  recordButton.classList.remove('recording');
  statusText.textContent = DEMO_MODE ? 'Processing (local)...' : 'Processing...';
}

async function playBackLocalRecording() {
  if (audioChunks.length === 0) { statusText.textContent = 'No audio recorded.'; return; }
  // In demo mode we simply play recorded audio locally (no server),
  // and amplitude fallback will move the jaw to speech energy.
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  const url = URL.createObjectURL(audioBlob);
  try {
    await playResponseAudio(url);
  } finally {
    URL.revokeObjectURL(url);
    setTimeout(() => { if (!isRecording) statusText.textContent = 'Demo mode: Ready.'; }, 800);
  }
}

async function processAudioToServer() {
  if (audioChunks.length === 0) { statusText.textContent = 'No audio recorded.'; return; }
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
    statusText.textContent = 'An error occurred. Please try again.';
  } finally {
    setTimeout(() => { if (!isRecording) statusText.textContent = 'Ready.'; }, 1000);
  }
}

async function playResponseAudio(url) {
  const audioContext = LipSync.getAudioContext();
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Start analysis (OVR path sets a ScriptProcessor; amplitude path no-ops here)
  LipSync.start(audioBuffer);

  // Slight preroll so visemes lead audio
  const AUDIO_PREROLL_MS = 70;
  await new Promise(r => setTimeout(r, AUDIO_PREROLL_MS));

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  // Let amplitude fallback tap the live audio
  LipSync.attachToSource(source);

  source.connect(audioContext.destination);
  source.start(0);
  source.onended = () => LipSync.stop();
}

function updateLoadingStatus(msg) {
  if (loadingStatus) loadingStatus.textContent = msg;
}
