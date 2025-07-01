from modules.mood.mood_engine import get_mood
from modules.music.spotify_data import search_track
from modules.music.last_fm_data import get_top_track_for_mood


if __name__ == "__main__":
    text = str(input("How do you feel today? "))
    mood_analysis = get_mood(text)
    print("Mood Analysis:", mood_analysis)

    dominant_mood, mood_score = mood_analysis
    print(f"Dominant Mood: {dominant_mood}")

    top_track = get_top_track_for_mood(dominant_mood)
    
    if top_track:
        print(f"Searching for: {top_track['track']} by {top_track['artist']}")
        spotify_result = search_track(top_track['track'], top_track['artist'])
        
        if spotify_result:
            print(f"Found on Spotify: {spotify_result['name']} by {spotify_result['artist']}")
            print(f"Listen here: {spotify_result['url']}")
            print(f"Album: {spotify_result['album']} ({spotify_result['release_date']})")
            print(f"Popularity: {spotify_result['popularity']}/100")
        else:
            print(f"'{top_track['track']}' by {top_track['artist']} not found on Spotify")
            print(f"Last.fm link: {top_track['url']}")
    else:
        print(f"No tracks found for mood: {dominant_mood}")