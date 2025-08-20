import os
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from transformers import AutoModelForCausalLM, AutoTokenizer

# --- Model Loading ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_NAME = os.getenv("LLM_MODEL", "microsoft/phi-2")
print(f"LLM Service: Using device {DEVICE}")
print(f"LLM Service: Loading model '{MODEL_NAME}'...")

# trust_remote_code is required for Phi-2
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype="auto", # Use bfloat16 on Ampere GPUs for speed
    device_map=DEVICE,
    trust_remote_code=True
)
print("LLM Service: Model loaded.")

app = FastAPI()

# --- System Prompt & Safety ---
SYSTEM_PROMPT = """You are an AI medical tutor. Your role is to provide clear, concise educational information about medical topics.
Constraints:
- DO NOT provide any medical advice, diagnosis, or prescriptions.
- Always encourage the user to consult a licensed healthcare professional for any personal health concerns.
- Keep your answers short, ideally between 2 to 5 sentences.
- If appropriate, ask one follow-up question to encourage further learning.
- If the user asks for a diagnosis or treatment, you MUST refuse and state your purpose is purely educational.
"""

SAFETY_DISCLAIMER = "\n\nDisclaimer: I am an AI tutor and cannot provide medical advice. This information is for educational purposes only. Please consult a licensed healthcare professional for any health concerns."

def simple_safety_pass(text: str) -> str:
    """A simple check for risky keywords. Appends a disclaimer if found."""
    risky_keywords = ["diagnose", "treat", "cure", "symptoms", "prescription", "my condition", "should I take"]
    if any(keyword in text.lower() for keyword in risky_keywords):
        return text + SAFETY_DISCLAIMER
    return text

# --- Pydantic Models ---
class HistoryItem(BaseModel):
    role: str
    content: str

class GenerateRequest(BaseModel):
    text: str
    history: List[HistoryItem] = []

# --- API Endpoint ---
@app.post("/generate")
def generate_response(request: GenerateRequest):
    try:
        # Format the conversation history for the model
        conversation = [{"role": "system", "content": SYSTEM_PROMPT}]
        for item in request.history:
            conversation.append({"role": item.role, "content": item.content})
        conversation.append({"role": "user", "content": request.text})

        # Use the tokenizer's chat template for correct formatting
        prompt = tokenizer.apply_chat_template(conversation, tokenize=False, add_generation_prompt=True)

        inputs = tokenizer(prompt, return_tensors="pt", return_attention_mask=True).to(DEVICE)

        # Generate the response
        outputs = model.generate(
            **inputs,
            max_new_tokens=250,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
            pad_token_id=tokenizer.eos_token_id
        )

        # Decode the generated text, skipping the prompt
        response_text = tokenizer.decode(outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
        
        # Apply safety check
        final_response = simple_safety_pass(response_text)

        return {"response": final_response.strip()}

    except Exception as e:
        print(f"Error during LLM generation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate response: {str(e)}")