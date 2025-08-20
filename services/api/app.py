import os
import whisper
from fastapi import FastAPI, UploadFile, File, HTTPException
from tempfile import NamedTemporaryFile
import torch

# Check for GPU
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"STT Service: Using device {DEVICE}")

# Load model from environment variable
MODEL_TYPE = os.getenv("WHISPER_MODEL", "medium")
print(f"STT Service: Loading Whisper model '{MODEL_TYPE}'...")
model = whisper.load_model(MODEL_TYPE, device=DEVICE)
print("STT Service: Model loaded.")

app = FastAPI()

@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    if not audio:
        raise HTTPException(status_code=400, detail="No audio file provided.")

    try:
        # Save uploaded file to a temporary file
        with NamedTemporaryFile(delete=True, suffix=".tmp") as temp_file:
            temp_file.write(await audio.read())
            temp_file.flush()

            # Transcribe the audio file
            result = model.transcribe(temp_file.name, fp16=torch.cuda.is_available())
            transcript = result["text"]

        return {"transcript": transcript}

    except Exception as e:
        print(f"Error during transcription: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to transcribe audio: {str(e)}")