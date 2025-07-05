from ytmusicapi import YTMusic

ytmusic = YTMusic()

def search_track_on_ytb(artirst, track_name):
    """
    Search for a track on YouTube Music using the YTMusic API.
    """

    response = ytmusic.search(f"{artirst},{track_name}", filter="songs")
    if response:
        first_song = response[0]

        return {
            #"title": first_song['title'],
            #"artist": first_song['artists'][0]['name'],
            "url": f"https://music.youtube.com/watch?v={first_song['videoId']}"
        }
    else:
        return None