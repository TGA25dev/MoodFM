from googletrans import Translator

async def translate_text(input_text: str) -> str:
    """
    Translates the input text to English using Google Translate.
    """

    translator = Translator()
    result = await translator.translate(input_text, dest='en')
    return result.text

async def detect_languages(input_text: str) -> str:
    """
    Detects the language of the input text using Google Translate.
    """
    
    async with Translator() as translator:
        result = await translator.detect(input_text)
        return result.lang