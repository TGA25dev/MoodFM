import requests
from modules.spotify.spotify_token import get_spotify_token

def search_track(artis_name, track_name):
    token = get_spotify_token()
    if not token:
        raise Exception("Failed to retrieve Spotify token")
    
    response = requests.get(
        "https://api.spotify.com/v1/search",
        headers={
            "Authorization": f"Bearer {token}"
        },
        params={
            "q": f"track:{track_name} artist:{artis_name}",
            "type": "track",
            "limit": 1
        }
    )
    if response.status_code != 200:
        raise Exception(f"Error searching track: {response.status_code} - {response.text}")
    data = response.json()
    tracks = data.get("tracks", {}).get("items", [])
    if not tracks:
        return None
    track = tracks[0]
    return {
        "id": track["id"],
        "name": track["name"],
        "artist": track["artists"][0]["name"],
        "url": track["external_urls"]["spotify"],
        "album": track["album"]["name"],
        "release_date": track["album"]["release_date"],
        "popularity": track["popularity"],
        "url": track["external_urls"]["spotify"]
    }