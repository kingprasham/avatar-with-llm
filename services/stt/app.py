import os
import whisper
from fastapi import FastAPI, UploadFile, File, HTTPException
from tempfile import NamedTemporaryFile
import torch

# --- Model Loading ---

# Check if a CUDA-enabled GPU is available, otherwise use the CPU
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"STT Service: Using device '{DEVICE}'")

# Get the desired Whisper model size from environment variables (e.g., "medium", "base")
# Defaults to "medium" if not set.
MODEL_TYPE = os.getenv("WHISPER_MODEL", "medium")
print(f"STT Service: Loading Whisper model '{MODEL_TYPE}'...")

# Load the pre-trained Whisper model onto the selected device
# The model will be downloaded automatically on the first run.
model = whisper.load_model(MODEL_TYPE, device=DEVICE)
print("STT Service: Model loaded successfully.")

# --- FastAPI Application ---

app = FastAPI()

@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    This endpoint receives an audio file, transcribes it using Whisper,
    and returns the resulting text.
    """
    if not audio:
        raise HTTPException(status_code=400, detail="No audio file provided.")

    try:
        # The uploaded file is in memory. To process it with Whisper,
        # we write its contents to a temporary file on disk.
        with NamedTemporaryFile(delete=True, suffix=".tmp") as temp_file:
            # Read the content of the uploaded file
            content = await audio.read()
            # Write the content to the temporary file
            temp_file.write(content)
            temp_file.flush()

            # Transcribe the audio file using the loaded Whisper model.
            # fp16=False is recommended for CPU execution to avoid potential errors.
            result = model.transcribe(temp_file.name, fp16=torch.cuda.is_available())
            transcript = result["text"]

        # Return the transcription in a JSON response
        return {"transcript": transcript}

    except Exception as e:
        # If any error occurs during the process, log it and return a 500 error.
        print(f"Error during transcription: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to transcribe audio: {str(e)}")