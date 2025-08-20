import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from piper.voice import PiperVoice
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from .env file
load_dotenv()

# --- Model Loading ---

# Get paths from environment variables
MODEL_PATH = os.getenv("PIPER_VOICE_PATH")
CONFIG_PATH = os.getenv("PIPER_VOICE_CONFIG_PATH")

print("TTS Service: Loading Piper voice...")

# Check if the model and config paths are set and exist
if not MODEL_PATH or not CONFIG_PATH:
    raise FileNotFoundError("PIPER_VOICE_PATH or PIPER_VOICE_CONFIG_PATH not set in .env file.")
if not Path(MODEL_PATH).exists() or not Path(CONFIG_PATH).exists():
    raise FileNotFoundError(f"Piper voice model or config not found at specified paths.")

# CORRECT WAY TO LOAD THE VOICE:
# Instantiate the PiperVoice object with model and config paths.
voice = PiperVoice(MODEL_PATH, CONFIG_PATH)
print("TTS Service: Voice loaded.")

app = FastAPI()

# --- Pydantic Model ---
class SynthesizeRequest(BaseModel):
    text: str

# --- API Endpoint ---
@app.post("/synthesize")
def synthesize_speech(request: SynthesizeRequest):
    try:
        # Synthesize audio in-memory
        # ThePiperVoice object is now callable for synthesis
        audio_bytes = voice.synthesize(request.text)
        
        # Return as a WAV file response
        return Response(content=audio_bytes, media_type="audio/wav")

    except Exception as e:
        print(f"Error during TTS synthesis: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to synthesize audio: {str(e)}")