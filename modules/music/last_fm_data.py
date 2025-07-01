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
    'joy': ['happy', 'upbeat', 'pop', 'dance', 'feel good'],
    'happiness': ['happy', 'upbeat', 'pop', 'dance', 'feel good'],
    'sadness': ['sad', 'melancholy', 'indie', 'alternative', 'emotional'],
    'anger': ['rock', 'metal', 'punk', 'aggressive', 'hard rock'],
    'fear': ['dark', 'ambient', 'electronic', 'atmospheric'],
    'surprise': ['experimental', 'indie', 'alternative', 'eclectic'],
    'disgust': ['grunge', 'alternative', 'punk', 'industrial'],
    'love': ['romantic', 'love songs', 'r&b', 'soul', 'ballad'],
    'excited': ['energetic', 'electronic', 'dance', 'pop', 'upbeat'],
    'calm': ['chill', 'ambient', 'folk', 'acoustic', 'relaxing'],
    'relaxed': ['chill', 'ambient', 'folk', 'acoustic', 'relaxing']
}

def get_top_track_for_mood(mood_tag: str) -> dict:
    tags = MOOD_TO_TAGS.get(mood_tag.lower(), ['pop'])  #Default to pop if mood not found
    
    # Try multiple tags to get better results
    for tag in tags:
        url = 'http://ws.audioscrobbler.com/2.0/'
        params = {
            'method': 'tag.gettoptracks',
            'tag': tag,
            'api_key': last_fm_api_key,
            'format': 'json',
            'limit': 20  # Get top 20 tracks
        }
        response = requests.get(url, params=params)
        if response.status_code != 200:
            continue
            
        data = response.json()
        tracks = data.get('tracks', {}).get('track', [])
        if not tracks:
            continue
        
        # Get a track from the top 10 (more popular tracks)
        top_tracks = tracks[:10]
        selected_track = top_tracks[random.randint(0, len(top_tracks) - 1)]

        return {
            'track': selected_track['name'],
            'artist': selected_track['artist']['name'],
            'url': selected_track['url']
        }
    
    #return None if no tracks found
    return None