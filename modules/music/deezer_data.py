import deezer

client = deezer.Client()

def search_track_on_deezer(artist_name, track_name):
    """
    Search for a track on Deezer using the Deezer API.
    """

    response = client.search(artist=artist_name, track=track_name)

    if response:
        first_track = response[0]  # Select the first track

        return {
            #"title": first_track.title,
            #"artist": first_track.artist.name,
            "url": first_track.link,
            "preview": first_track.preview,
            "id": first_track.id,
        }
    else:
        return None

def get_deezer_track_by_id(track_id):
    """
    Get track details from Deezer by track ID
    """
    try:
        track_id = int(track_id)
        track = client.get_track(track_id)
        
        if track:
            return {
                "id": track.id,
                "title": track.title,
                "artist": track.artist.name,
                "url": track.link,
                "preview": track.preview,
                "cover_image": track.album.cover_xl if hasattr(track, 'album') and track.album else None
            }
        return None
    except Exception as e:
        print(f"Error fetching Deezer track by ID: {e}")
        return None