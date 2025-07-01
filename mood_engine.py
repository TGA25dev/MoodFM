import text2emotion as te
import requests
from dotenv import load_dotenv
import os
import random

# Load environment variables from .env file
load_dotenv()

# Get API key from environment variables
LAST_FM_API_KEY = os.getenv('LAST_FM_API_KEY')

def analyse_mood(input:str) -> dict:

    """
    Analyse the mood of a given text input.
    """

    result = te.get_emotion(input) #Output {'Happy': 0.1, 'Angry': 0.2, 'Sad': 0.3, 'Surprise': 0.4, 'Fear': 0.5}
    
    if all(value == 0 for value in result.values()):
        return {"Neutral": 1.0}

    dominant_emotion = max(result, key=result.get)
    dominant_score = result[dominant_emotion]

    return {dominant_emotion: dominant_score}

def get_top_track_for_mood(mood_tag: str) -> dict:
    url = 'http://ws.audioscrobbler.com/2.0/'
    params = {
        'method': 'tag.gettoptracks',
        'tag': mood_tag,
        'api_key': LAST_FM_API_KEY,
        'format': 'json',
        'limit': 50 #Get 50 tracks
    }
    response = requests.get(url, params=params)
    if response.status_code != 200:
        return None
    data = response.json()
    tracks = data.get('tracks', {}).get('track', [])
    if not tracks:
        return None
    
    top_track = tracks[random.randint(0, len(tracks) - 1)]  #Randomly select a track from the list

    return {
        'track': top_track['name'],
        'artist': top_track['artist']['name'],
        'url': top_track['url']
    }

if __name__ == "__main__":
    text = str(input("How do you feel today? "))
    mood_analysis = analyse_mood(text)
    print("Mood Analysis:", mood_analysis)

    dominant_mood = max(mood_analysis, key=mood_analysis.get)
    print(f"Dominant Mood: {dominant_mood}")

    top_track = get_top_track_for_mood(dominant_mood)
    if top_track:
        print(f"Top Track for {dominant_mood}: {top_track['track']} by {top_track['artist']}")
        print(f"Listen here: {top_track['url']}")
    else:
        print(f"No top track found for mood: {dominant_mood}")