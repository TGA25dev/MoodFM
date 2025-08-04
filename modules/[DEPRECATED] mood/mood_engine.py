import os
from dotenv import load_dotenv
from transformers import pipeline

# Load environment variables from .env file
load_dotenv()

def get_mood(input: str) -> tuple[str, float]:
    pipe = pipeline("text-classification", model="j-hartmann/emotion-english-distilroberta-base")
    result = pipe(input)
    
    best_result = max(result, key=lambda x: x['score'])
    return best_result['label'], best_result['score']
