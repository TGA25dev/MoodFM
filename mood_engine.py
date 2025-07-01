import text2emotion as te
import requests
from dotenv import load_dotenv
import os
import random
from modules.spotify.spotify_data import search_track

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

    top_track_name = top_track['name']
    top_track_artist = top_track['artist']['name']
    top_track_url = top_track['url']

    return {
        'track': top_track_name,
        'artist': top_track_artist,
        'url': top_track_url
    }

def get_spotif_link(track_name:str, artist_name:str) -> str:
    """
    Get Spotify link for a given track and artist.
    """
    search_track_result = search_track(artist_name, track_name) #Get track data from Spotify
    if search_track_result:
        return search_track_result['url']
    else:
        return None

if __name__ == "__main__":
    text = str(input("How do you feel today? "))
    mood_analysis = analyse_mood(text)
    print("Mood Analysis:", mood_analysis)

    dominant_mood = max(mood_analysis, key=mood_analysis.get)
    print(f"Dominant Mood: {dominant_mood}")

    top_track = get_top_track_for_mood(dominant_mood)
    link = get_spotif_link(top_track['track'], top_track['artist']) if top_track else None

    if top_track:
        print(f"Top Track for {dominant_mood}: {top_track['track']} by {top_track['artist']}")
        print(f"Listen here: {link if link else 'No Spotify link available'}")
    else:
        print(f"No top track found for mood: {dominant_mood}")