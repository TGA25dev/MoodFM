import requests
import random
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

# Get API key from environment variables
last_fm_api_key = os.getenv('LAST_FM_API_KEY')

# Map emotions to better music tags/genres
MOOD_TO_TAGS = {
    'joy': ['happy', 'upbeat', 'pop', 'dance', 'feel good', 'electropop'],
    'sadness': ['melancholy', 'indie', 'alternative', 'emotional', 'acoustic'],
    'anger': ['aggressive', 'hard rock', 'metal', 'punk', 'industrial'],
    'fear': ['dark ambient', 'electronic', 'atmospheric', 'cinematic'],
    'disgust': ['grunge', 'noise rock', 'industrial', 'raw', 'alt punk'],
    'surprise': ['experimental', 'eclectic', 'electronic', 'funk', 'alt pop'],
}


# Track of previously returned tracks
PREVIOUS_TRACKS = set()

def get_top_track_for_mood(mood_tag: str) -> dict:
    global PREVIOUS_TRACKS
    
    # Get tags for the mood
    tags = MOOD_TO_TAGS.get(mood_tag.lower())
    
    for tag in tags:
        url = 'http://ws.audioscrobbler.com/2.0/'
        params = {
            'method': 'tag.gettoptracks',
            'tag': tag,
            'api_key': last_fm_api_key,
            'format': 'json',
            'limit': 100
        }
        response = requests.get(url, params=params)
        if response.status_code != 200:
            continue
            
        data = response.json()
        tracks = data.get('tracks', {}).get('track', [])
        if not tracks:
            continue
        
        # Shuffle the tracks
        random.shuffle(tracks)
        
        # Filter out previously returned tracks
        filtered_tracks = [track for track in tracks if track['name'] not in PREVIOUS_TRACKS]
        if not filtered_tracks:
            continue
        
        # Select the first track from the shuffled and filtered list
        selected_track = filtered_tracks[0]
        PREVIOUS_TRACKS.add(selected_track['name'])

        return {
            'track': selected_track['name'],
            'artist': selected_track['artist']['name'],
            'url': selected_track['url']
        }
    
    return None