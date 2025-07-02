import os
from dotenv import load_dotenv
from huggingface_hub import InferenceClient

# Load environment variables from .env file
load_dotenv()

def get_mood(input:str) ->tuple[str, float]:
    hg_api_key = os.getenv("HG_API_KEY")

    client = InferenceClient(
        provider="auto",
        api_key=hg_api_key,
    )

    result = client.text_classification(
        input,
        model="michellejieli/emotion_text_classifier",
    )

    best_label = max(result, key=lambda x: x.score)
    return best_label.label, best_label.score