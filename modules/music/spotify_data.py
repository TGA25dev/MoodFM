import requests
from modules.music.spotify_token import get_spotify_token

def search_track_on_spotify(track_name, artist_name):
    token = get_spotify_token()
    if not token:
        raise Exception("Failed to retrieve Spotify token")
    

    search_queries = [
        f'track:"{track_name}" artist:"{artist_name}"',  # Exact match
        f'"{track_name}" "{artist_name}"',  #General search with quotes
        f'{track_name} {artist_name}',  # Simple search
        f'artist:"{artist_name}"',  # Just the artist if track not found
    ]
    
    for query in search_queries:
        response = requests.get(
            "https://api.spotify.com/v1/search",
            headers={
                "Authorization": f"Bearer {token}"
            },
            params={
                "q": query,
                "type": "track",
                "limit": 1
            }
        )
        
        if response.status_code != 200:
            continue
            
        data = response.json()
        tracks = data.get("tracks", {}).get("items", [])
        
        if tracks:
            track = tracks[0]
            return {
                "id": track["id"],
                "name": track["name"],
                "artist": track["artists"][0]["name"],
                "url": track["external_urls"]["spotify"],
                "album": track["album"]["name"],
                "cover_image": track["album"]["images"][0]["url"] if track["album"]["images"] else None
            }
    
    return None  # No track found

def get_spotify_track_by_id(track_id):
    """
    Get track details from Spotify by track ID
    """
    try:
        token = get_spotify_token()
        if not token:
            raise Exception("Failed to retrieve Spotify token")
            
        response = requests.get(
            f"https://api.spotify.com/v1/tracks/{track_id}",
            headers={
                "Authorization": f"Bearer {token}"
            }
        )
        
        if response.status_code != 200:
            return None
            
        track = response.json()
        
        return {
            "id": track["id"],
            "name": track["name"],
            "artist": track["artists"][0]["name"],
            "url": track["external_urls"]["spotify"],
            "album": track["album"]["name"],
            "cover_image": track["album"]["images"][0]["url"] if track["album"]["images"] else None
        }
    except Exception as e:
        print(f"Error fetching Spotify track by ID: {e}")
        return None