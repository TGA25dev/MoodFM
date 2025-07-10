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
        }
    else:
        return None