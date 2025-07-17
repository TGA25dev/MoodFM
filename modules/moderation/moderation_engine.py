from transformers import pipeline

# Load hate speech detection model
hate_model = pipeline("text-classification", model="facebook/roberta-hate-speech-dynabench-r4-target", top_k=1)

# Load general toxicity detection model
toxicity_model = pipeline("text-classification", model="unitary/toxic-bert")

def check_input_safety(text, threshold=0.5):
    """
    Moderate the input text for hate speech and toxicity.
    """

    hate_result = hate_model(text)
    toxicity_result = toxicity_model(text)

    # Handle possible nested list from hate_model
    if isinstance(hate_result, list) and isinstance(hate_result[0], list):
        hate_result = hate_result[0]

    hate_harmful = any(
        res["label"].lower() != "nothate" and res["score"] > threshold
        for res in hate_result
    )
    tox_harmful = any(
        res["label"].lower() != "non-toxic" and res["score"] > threshold
        for res in toxicity_result
    )
    text_is_safe = not hate_harmful and not tox_harmful

    return text_is_safe