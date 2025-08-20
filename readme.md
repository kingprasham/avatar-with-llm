# 3D Medical Avatar Tutor (Free & Open Source)

This repository contains a complete, end-to-end solution for deploying a 3D medical avatar that listens to user voice input and responds with lip-synced speech. The entire stack is built using free, open-source software and can be hosted for $0.



The system uses Whisper for speech-to-text, a local LLM for generating responses, and Piper for text-to-speech. Lip-sync is achieved in real-time using OVR LipSync (via WebAssembly) with a fallback to the non-real-time Rhubarb Lip-Sync.

---

## Features

-   **Real-time Interaction:** Speak into your microphone and get a spoken, animated response.
-   **High-Quality AI:** Powered by OpenAI's **Whisper** (STT), **Phi-2** (LLM), and **Piper** (TTS).
-   **Real-time Lip-Sync:** Browser-based viseme detection using **OVR LipSync (WASM)** for instant animation.
-   **Fallback Sync:** **Rhubarb Lip-Sync** provides animation for browsers where WASM fails.
-   **3D Avatar:** Uses a standard **GLB** model with **ARKit-style blendshapes**, easily created in MakeHuman or Blender (MB-Lab).
-   **Zero Cost Hosting:** Frontend deployed on **GitHub Pages** / **Netlify**, with the backend running locally and securely exposed via a **Cloudflare Tunnel**.
-   **Modular Backend:** Services are built as independent FastAPI microservices for scalability and maintenance.

---

## License & Disclaimers

This project is for educational and demonstrational purposes. The AI is configured as a medical tutor and is **explicitly instructed NOT to provide medical advice, diagnoses, or prescriptions.** Always consult a licensed healthcare professional for medical concerns.

### License Check

-   **Core Stack (Whisper, Piper, Phi-2, FastAPI, Three.js, etc.):** Permissive licenses (MIT, Apache 2.0).
-   **Rhubarb Lip-Sync:** MIT License.
-   **OVR LipSync:** The WebAssembly module is derived from the Oculus Audio SDK. Its license is permissive for development but has specific terms. For any commercial or large-scale distribution, review the official Oculus SDK license. This project includes a fully-functional Rhubarb fallback to ensure it remains 100% redistribution-safe and functional without the OVR component.

---

## 1. Local Setup

### Prerequisites

-   Python 3.9+ and `pip`
-   `virtualenv` (`pip install virtualenv`)
-   `ffmpeg` (Required by Whisper):
    -   **macOS:** `brew install ffmpeg`
    -   **Ubuntu/Debian:** `sudo apt-get install ffmpeg`
    -   **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to your system's PATH.
-   A modern web browser (Chrome/Firefox recommended for WebAssembly and WebAudio support).

### Steps

1.  **Clone the Repository:**
    ```bash
    git clone <your-repo-url>
    cd <your-repo-folder>
    ```

2.  **Create and Activate Virtual Environment:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  **Install Python Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
    *Note: This will install PyTorch. If you have a compatible NVIDIA GPU, you can install a CUDA-enabled version for significantly faster AI model execution. See [PyTorch installation instructions](https://pytorch.org/get-started/locally/).*

4.  **Set Up Environment Variables:**
    Copy the example `.env` file and edit if needed. The defaults are fine for local execution.
    ```bash
    cp .env.example .env
    ```

5.  **Initialize the Database:**
    Run the Alembic migration to create the necessary database tables in `database.db`.
    ```bash
    alembic upgrade head
    ```

---

## 2. Download AI Models

1.  **Whisper Model:** The `whisper` library will automatically download the model specified in `.env` (default: `medium`) on its first run. No manual download is needed.

2.  **LLM Model (Phi-2):** The `transformers` library will automatically download the `microsoft/phi-2` model on its first run.

3.  **Piper TTS Voice:** Create a directory for voices and download a pre-trained voice model. We'll use the recommended `en_US-lessac-medium` voice.
    ```bash
    mkdir -p models/tts
    cd models/tts
    wget [https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx](https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx)
    wget [https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json](https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json)
    cd ../..
    ```
    *Ensure the path in your `.env` file (`PIPER_VOICE_PATH`) matches this location.*

---

## 3. Build & Ship OVR LipSync WASM

For convenience, a pre-built WASM module and its JS wrapper are included in `frontend/assets/wasm/`. These were extracted from a prior version of the Oculus Audio SDK. If you need to rebuild them, you would need to find and use the SDK's source.

To ensure your web server serves the `.wasm` file correctly, you might need to configure the MIME type. For local testing with Python's simple HTTP server or when deploying, ensure `.wasm` is served with `Content-Type: application/wasm`. GitHub Pages handles this automatically.

---

## 4. Running the Services

The backend consists of four separate services. Run each one in a **separate terminal** from the project's root directory.

1.  **STT Service (Whisper):**
    ```bash
    uvicorn services.stt.app:app --port 8001
    ```

2.  **LLM Service (Phi-2):**
    ```bash
    uvicorn services.llm.app:app --port 8002
    ```

3.  **TTS Service (Piper):**
    ```bash
    uvicorn services.tts.app:app --port 8003
    ```

4.  **Main API Gateway:**
    ```bash
    uvicorn services.api.app:app --port 8000
    ```

After these are running, your local AI backend is ready at `http://localhost:8000`.

---

## 5. Hosting & Deployment ($0 Cost)

### Frontend (GitHub Pages)

1.  Push the `frontend` directory contents to a new GitHub repository.
2.  In the repository settings, go to `Pages`.
3.  Under "Build and deployment", select **Deploy from a branch**.
4.  Choose the `main` branch and the `/ (root)` folder. Click **Save**.
5.  Your frontend will be live at `https://<username>.github.io/<repo-name>/`. **Note this URL.**

### Backend (Cloudflare Tunnel)

Your backend is running locally on `localhost:8000`. We'll use a free Cloudflare Tunnel to expose it to the internet with a secure HTTPS URL.

1.  **Sign up** for a free Cloudflare account.
2.  **Install `cloudflared`:** Follow the [official Cloudflare instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/installation/) for your OS.
3.  **Authenticate `cloudflared`:**
    ```bash
    cloudflared tunnel login
    ```
4.  **Create and run the tunnel:** This single command exposes `localhost:8000` to a public URL.
    ```bash
    cloudflared tunnel --url http://localhost:8000
    ```
5.  Cloudflare will output a URL like `https://<random-name>.trycloudflare.com`. **This is your public backend URL.**
6.  **Update Frontend Config:** Open `frontend/js/app.js` and change the `API_BASE_URL` constant to your new Cloudflare URL.
    ```javascript
    const API_BASE_URL = 'https://<your-random-name>.trycloudflare.com';
    ```
7.  Commit and push this change to your GitHub repo. GitHub Pages will automatically redeploy.

You now have a globally accessible 3D avatar with a secure, free backend!

---

## 6. Avatar Generation

You can use any `GLB` model that includes **ARKit blendshapes** (e.g., `mouthSmileLeft`, `jawOpen`, `viseme_CH`, etc.).

### Quickstart (Recommended)

1.  Go to [Ready Player Me](https://readyplayer.me/).
2.  Create a custom avatar.
3.  When downloading, select the `.glb` format. The downloaded file will include ARKit blendshapes by default.
4.  Rename the file to `avatar.glb` and place it in the `frontend/assets/models/` directory.

### Advanced (MB-Lab in Blender)

1.  Install Blender (free).
2.  Install the [MB-Lab](https://mb-lab.readthedocs.io/en/latest/installation.html) addon (free).
3.  Generate a character.
4.  In the MB-Lab panel, find the "Facial Expressions" section and create the **ARKit Blendshapes**.
5.  Select only the head mesh.
6.  Go to `File -> Export -> glTF 2.0 (.glb/.gltf)`.
7.  In the export settings, enable **"Include -> Selected Objects"** and **"Data -> Mesh -> Apply Modifiers"**. Also, ensure **"Animation -> Shape Keys"** is enabled.
8.  Export as `avatar.glb` to `frontend/assets/models/`.

---

## 7. Troubleshooting

-   **Mic Permissions:** The browser will ask for microphone permission. You must click "Allow". Ensure your site is served over HTTPS (Cloudflare and GitHub Pages handle this) as browsers require it for microphone access.
-   **CORS Errors:** The FastAPI backend is configured to allow all origins (`*`) by default for easy setup. For production, you should restrict this to your GitHub Pages URL in `services/api/app.py`.
-   **`.wasm` MIME Type:** If OVR LipSync fails to load, check the browser's developer console. An error about MIME types means your server isn't serving `.wasm` files correctly.
-   **GPU/Performance:** AI models are computationally expensive. If STT or LLM responses are slow, check your system's CPU/memory usage. Using a CUDA-enabled GPU for Whisper and the LLM will provide a massive speedup.
-   **Piper Voices:** Ensure the path in `.env` (`PIPER_VOICE_PATH`) is correct and points to the `.onnx` file.