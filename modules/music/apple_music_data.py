import requests
import json

def search_track_on_apple_music(artist_name, track_name):
    """
    Search for a track on Apple Music using the iTunes Search API.
    """

    itunes_response = requests.get(
        "https://itunes.apple.com/search",
        params={
            "term": f"{track_name} {artist_name}",
            "entity": "song"
        }
    ).json()

    if itunes_response["resultCount"] > 0:
        itunes_track = itunes_response["results"][0]
        return {
            "url": itunes_track['trackViewUrl'],
            #"track": itunes_track['trackName'],
            #"artist": itunes_track['artistName'],
        }
    else:
        return None
