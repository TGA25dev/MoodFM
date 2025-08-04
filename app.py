from flask import Flask, request, jsonify, render_template, session
import logging
from datetime import timedelta
import redis
from dotenv import load_dotenv
import os
from flask_cors import CORS
from flask_talisman import Talisman
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_session import Session
from redis import Redis
import bleach
from datetime import datetime
from functools import wraps
import threading

#Tranlation
from modules.translation.translator import translate_text, detect_languages

# Mood engine
from modules.mood.mood_engine import get_mood
from modules.music.last_fm_data import get_top_track_for_mood

# Music providers
from modules.music.spotify_data import search_track_on_spotify, get_spotify_track_by_id
from modules.music.ytb_music_data import search_track_on_ytb
from modules.music.deezer_data import search_track_on_deezer, get_deezer_track_by_id
from modules.music.apple_music_data import search_track_on_apple_music

# Rate limiting and moderation
from modules.ratelimit.ratelimiter import limiter
from modules.moderation.moderation_engine import check_input_safety

# Statistics tracking
from modules.statistics.stats import write_stats, read_stats, cleanup_expired_stats, monitor_pool, increment_visits_count, increment_unique_users_count, increment_shared_songs_count, increment_submited_moods_count
from modules.statistics.tracking import get_stats


load_dotenv()

app = Flask(__name__)

redis_connection = redis.Redis(
    host=os.getenv('REDIS_HOST'),
    port=int(os.getenv('REDIS_PORT')),
    db=int(os.getenv('REDIS_DB')),
    password=os.getenv('REDIS_PASSWORD')
)

initialized = False

# Initialize limiter
limiter.init_app(app)

app.wsgi_app = ProxyFix(
    app.wsgi_app,
    x_for=2,       # Number of proxies setting X-Forwarded-For
    x_proto=1,     # Number of proxies setting X-Forwarded-Proto
    x_host=1,      # Number of proxies setting X-Forwarded-Host
    x_port=0,      # Number of proxies setting X-Forwarded-Port
    x_prefix=0     # Number of proxies setting X-Forwarded-Prefix
)
# Parse CORS settings
cors_origins = [origin.strip() for origin in os.getenv('CORS_ORIGINS', '').split(',')]
cors_methods = [method.strip() for method in os.getenv('CORS_METHODS', '').split(',')]
cors_headers = [header.strip() for header in os.getenv('CORS_HEADERS', '').split(',')]
cors_credentials = os.getenv('CORS_CREDENTIALS', 'False')

if not cors_origins or not cors_methods or not cors_headers:
    raise RuntimeError("CORS_ORIGINS, CORS_METHODS, and CORS_HEADERS environment variables must be set.")

CORS(app, 
     resources={r"/*": {
         "origins": cors_origins,
         "methods": cors_methods,
         "allow_headers": cors_headers,
         "supports_credentials": cors_credentials
     }}
)

Talisman(app,
    force_https=True,
    strict_transport_security=True,
    session_cookie_secure=True,
    session_cookie_http_only=True,
    content_security_policy=False
)

app.config['SESSION_TYPE'] = 'redis'
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_KEY_PREFIX'] = 'session:'
app.config['SESSION_REDIS'] = Redis(
    host=os.getenv('REDIS_HOST'),
    port=int(os.getenv('REDIS_PORT')),
    db=int(os.getenv('REDIS_DB')),
    password=os.getenv('REDIS_PASSWORD')
)

Session(app)

# Setup logging
logging.basicConfig(format='%(asctime)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

file_handler = logging.FileHandler('app.log')
file_handler.setLevel(logging.DEBUG)
file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)

app.secret_key = os.getenv('FLASK_KEY')
app.config['SESSION_COOKIE_SAMESITE'] = 'Strict'
app.config['SESSION_COOKIE_SECURE'] = True  #HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1)

@app.errorhandler(500)
def internal_error(error):
    logger.critical(f"Internal Server Error: {error}")
    return jsonify({'error': 'An internal error occurred'}), 500

@app.errorhandler(429)
def ratelimit_error(error):    
    logger.warning(f"Rate limit exceeded: {error}")

    return jsonify({
        'error': 'Rate limit exceeded, please try again later.',
    }), 429


@app.errorhandler(404)
def page_not_found(error):
    logger.warning(f"Page not found: {error}")
    if request.accept_mimetypes.accept_html:
        return render_template('404.html'), 404
    #otherwise it returns JSON
    return jsonify({'error': 'Page not found'}), 404

def check_temp_ban(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        ip = request.remote_addr
        if redis_connection.get(f"banned:{ip}"):
            return jsonify({"error": "You are temporarily banned due to repeated harmful input. Please try again later."}), 429
        return func(*args, **kwargs)
    return wrapper

#Basic Root
@app.route('/', methods=['GET'])
@limiter.limit("50 per minute")
def index():
    increment_visits_count()  # Always increment
    if not session.get('counted_unique'):
        increment_unique_users_count()  # Only once per session
        session['counted_unique'] = True
    cache_buster = datetime.now().strftime("%Y%m%d%H%M%S")
    return render_template('index.htm', cache_buster=cache_buster)

# API Endpoints

@app.route('/stats', methods=['POST', 'GET'])
@check_temp_ban
@limiter.limit(os.getenv("STATS_ENDPOINT_LIMIT", "10") + " per minute")
async def get_stats_endpoint():
    """
    Enepoint to get the stats of a specific period
    """

    period = request.args.get('period').lower()
    valid_periods = ['month', 'today', 'ever']

    if period not in valid_periods:
        return jsonify({"error": f"Invalid period. Valid options are: {', '.join(valid_periods)}"}), 400

    read_stats_data = read_stats(period)
    if not read_stats_data:
        return jsonify({"message": "No statistics available yet. Please check back later."}), 200
    
    logger.debug(f"Stats retrieved: {read_stats_data}")
    return jsonify(read_stats_data), 200

@app.route('/mood', methods=['POST'])
@check_temp_ban
@limiter.limit(os.getenv("MOOD_ENDPOINT_LIMIT", "10") + " per minute")
async def mood_endpoint():
    """
    Enepoint to analyse mood from user text input
    """

    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"error": "Invalid input"}), 400
    
    text = data['text']
    # Sanitize input to prevent XSS attacks
    text = bleach.clean(text)
    ee_text = text.lower().replace(" ", "")
    if not text:
        return jsonify({"error": "Text cannot be empty"}), 400
    
    if ee_text == "rickroll":
        logger.info("Rickroll detected, redirecting to YouTube")
        return jsonify({
            "rickroll": "You've been Rickrolled !",
            "rickroll_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        }), 200
    
    elif ee_text == "skibidi":
        logger.info("What the freak is that ?")
        return jsonify({
            "skibidi": "Ooopsie",
            "skibidi_url": "https://www.instagram.com/thibo888/"
        }), 200
    
    #TRANSLATION
    input_langage = await detect_languages(text)
    if input_langage != "en":
        try:
            text = await translate_text(text)
            logger.debug(f"Translated text from {input_langage} to English: {text}")
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return jsonify({"error": "Translation service is temporarily unavailable. Please try again later."}), 503
        
    
    # MODERATION CHECK
    is_safe = check_input_safety(text)
    if not is_safe:
        logger.warning(f"Unsafe input detected: {text}")
        ip = request.remote_addr
        # Increment harmful count
        key = f"harmful_count:{ip}"
        count = redis_connection.incr(key)
        if count == 1:
            # Set expiry for the first offense
            redis_connection.expire(key, 3600)
        if count >= 3:
            # Ban IP for 10 minutes
            redis_connection.setex(f"banned:{ip}", 600, "1")
            redis_connection.delete(key)  # Reset counter after ban
            return jsonify({"error": "Input text contains harmful content, you are temporarily banned due to repeated harmful input."}), 400
        else:
            return jsonify({"error": "Input text contains harmful content, please rephrase"}), 400
    
    mood_analysis = get_mood(text)
    if not mood_analysis or mood_analysis[0] is None:
        return jsonify({
            "error": "Mood analysis service is temporarily unavailable. Please try again later.",
            "service_status": "degraded"
        }), 503  # Service Unavailable
    
    dominant_mood, mood_score = mood_analysis
    logger.info(f"Mood analysis for text: {text} - Dominant Mood: {dominant_mood}, Score: {mood_score}")

    if dominant_mood is None or mood_score is None or dominant_mood == "neutral":
        return jsonify({"error": "Mood analysis returned no dominant mood"}), 400
    
    ip = request.remote_addr
    try:
        get_stats(ip, text, dominant_mood)  # Log the request for statistics

    except Exception as e:
        logger.error(f"Error retrieving statistics for IP {ip}: {e}")

    try:
        write_stats(dominant_mood)  # Write mood stats
        increment_submited_moods_count()  # Increment submitted moods count
        
    except Exception as e:
        logger.error(f"Error writing stats: {e}")
        return jsonify({"error": "Failed to write mood statistics"}), 500

    return jsonify({
        "dominant_mood": dominant_mood,
        "mood_score": f"{int(round(float(mood_score) * 100))}%"
        }), 200

@app.route('/music', methods=['POST'])
@check_temp_ban
@limiter.limit(os.getenv("MUSIC_ENDPOINT_LIMIT", "10") + " per minute")
def music_endpoint():
    """
    Endpoint to get music recommendations based on mood
    """
    
    data = request.get_json()
    if not data or 'mood' not in data:
        return jsonify({"error": "Invalid input"}), 400
    
    mood_tag = data['mood']

    # Sanitize input to prevent XSS attacks
    mood_tag = bleach.clean(mood_tag)
    if not mood_tag:
        return jsonify({"error": "Mood cannot be empty"}), 400
    
    top_track = get_top_track_for_mood(mood_tag)
    
    if not top_track:
        return jsonify({"error": "No tracks found for the specified mood"}), 404
    
    logger.info(f"Top track for mood '{mood_tag}': {top_track['track']} by {top_track['artist']}")
    
    # Different music providers and their search functions
    providers = {
        "spotify": lambda: search_track_on_spotify(top_track['track'], top_track['artist']),
        "deezer": lambda: search_track_on_deezer(top_track['artist'], top_track['track']),
        "ytb_music": lambda: search_track_on_ytb(top_track['artist'], top_track['track']),
        "apple_music": lambda: search_track_on_apple_music(top_track['artist'], top_track['track'])
    }

    results = {}
    found_any = False

    for provider, search_fn in providers.items():
        try:
            result = search_fn()
            if result:
                results[provider] = result
                found_any = True
            else:
                logger.warning(f"Track '{top_track['track']}' by {top_track['artist']} not found on {provider.capitalize()}")
        except Exception as e:
            logger.error(f"Error searching {provider}: {e}")

    if not found_any:
        return jsonify({
            "message": "Track not found on any provider",
            "last_fm_url": top_track['url']
        }), 404

    results["last_fm_url"] = top_track['url']
    return jsonify(results), 200

@app.route('/shared', methods=['GET'])
@check_temp_ban
@limiter.limit(os.getenv("MUSIC_ENDPOINT_LIMIT", "10") + " per minute")
def shared_page():
    """
    Serve the main page for shared songs
    """
    increment_shared_songs_count()
    cache_buster = datetime.now().strftime("%Y%m%d%H%M%S")
    return render_template('index.htm', cache_buster=cache_buster)

@app.route('/shared-lookup', methods=['GET'])
@check_temp_ban
@limiter.limit(os.getenv("MUSIC_ENDPOINT_LIMIT", "10") + " per minute")
def shared_song_endpoint():
    """
    Endpoint to get song details from a shared link
    """
    provider = request.args.get('provider')
    track_id = request.args.get('id')
    mood = request.args.get('mood')
    cover_image = request.args.get('cover')
    
    if not provider or not track_id or not mood:
        return jsonify({"error": "Missing provider or track ID or mood"}), 400
        
    # Sanitize inputs
    provider = bleach.clean(provider)
    track_id = bleach.clean(track_id)
    mood = bleach.clean(mood)

    if provider not in ['deezer', 'spotify']:
        return jsonify({"error": "Unsupported provider"}), 400
    

    # Normalize mood input
    mood_map = {
        "anger": "angry",
        "disgust": "disgusted",
        "fear": "scared",
        "joy": "joy",
        "sadness": "sad",
        "sad": "sad",
        "surprise": "surprised",
        "surprised": "surprised"
    }
    mood = mood_map.get(mood.lower(), mood.lower())
    if mood not in ['angry', "disgusted", "scared", "joy", "sad", "surprised"]:
        return jsonify({"error": "Unsupported mood"}), 400
    
    try:
        if provider == 'deezer':
            # Get song details from Deezer ID
            track_data = get_deezer_track_by_id(track_id)
            
            if track_data:
                # Also search on other providers for links
                spotify_data = search_track_on_spotify(track_data.get('title'), track_data.get('artist'))
                ytb_data = search_track_on_ytb(track_data.get('artist'), track_data.get('title'))
                apple_data = search_track_on_apple_music(track_data.get('artist'), track_data.get('title'))

                return jsonify({
                    "name": track_data.get('title'),
                    "artist": track_data.get('artist'),
                    "cover_image": cover_image or track_data.get('cover_image'),
                    "deezer_url": track_data.get('url'),
                    "preview": track_data.get('preview'),
                    "spotify_url": spotify_data.get('url') if spotify_data else None,
                    "youtube_url": ytb_data.get('url') if ytb_data else None,
                    "apple_music_url": apple_data.get('url') if apple_data else None,
                    "mood": mood
                }), 200
            else:
                # Get track name and artist from query params for fallback
                track_name = request.args.get('name')
                artist_name = request.args.get('artist')
                
                if track_name and artist_name:
                    # Try to find on other platforms
                    spotify_data = search_track_on_spotify(track_name, artist_name)
                    ytb_data = search_track_on_ytb(artist_name, track_name)
                    apple_data = search_track_on_apple_music(artist_name, track_name)

                    return jsonify({
                        "error": "Track not found on Deezer, trying other providers",
                        "spotify_url": spotify_data.get('url') if spotify_data else None,
                        "youtube_url": ytb_data.get('url') if ytb_data else None,
                        "apple_music_url": apple_data.get('url') if apple_data else None,
                        "mood": mood,
                    }), 404
                else:
                    return jsonify({"error": "Track not found on Deezer and no fallback information provided"}), 404
                
        elif provider == 'spotify':
            # Get song details from Spotify ID
            track_data = get_spotify_track_by_id(track_id)
            
            if track_data:
                # For Spotify tracks, try to get preview URL from Deezer
                deezer_data = search_track_on_deezer(track_data.get('artist'), track_data.get('name'))
                ytb_data = search_track_on_ytb(track_data.get('artist'), track_data.get('name'))
                apple_data = search_track_on_apple_music(track_data.get('artist'), track_data.get('name'))

                return jsonify({
                    "name": track_data.get('name'),
                    "artist": track_data.get('artist'),
                    "cover_image": cover_image or track_data.get('cover_image'),
                    "spotify_url": track_data.get('url'),
                    "deezer_url": deezer_data.get('url') if deezer_data else None,
                    "youtube_url": ytb_data.get('url') if ytb_data else None,
                    "apple_music_url": apple_data.get('url') if apple_data else None,
                    "preview": deezer_data.get('preview') if deezer_data else None,
                    "mood": mood
                }), 200
            else:
                # Get track name and artist from query params for fallback
                track_name = request.args.get('name')
                artist_name = request.args.get('artist')
                
                if track_name and artist_name:
                    # Try to find on other platforms
                    deezer_data = search_track_on_deezer(artist_name, track_name)
                    ytb_data = search_track_on_ytb(artist_name, track_name)
                    apple_data = search_track_on_apple_music(artist_name, track_name)

                    return jsonify({
                        "error": "Track not found on Spotify, trying other providers",
                        "deezer_url": deezer_data.get('url') if deezer_data else None,
                        "youtube_url": ytb_data.get('url') if ytb_data else None,
                        "apple_music_url": apple_data.get('url') if apple_data else None,
                        "preview": deezer_data.get('preview') if deezer_data else None,
                        "mood": mood
                    }), 404
                else:
                    return jsonify({"error": "Track not found on Spotify and no fallback information provided"}), 404
            
    except Exception as e:
        logger.error(f"Error processing shared song: {e}")
        return jsonify({"error": "Failed to retrieve track information"}), 500

@app.route('/ping', methods=['GET'])
@check_temp_ban
@limiter.limit(os.getenv("PING_ENDPOINT_LIMIT", "10") + " per minute")
def test_endpoint():
    """Ping endpoint to test server availability"""
    client_ip = request.remote_addr
    logger.info(f"{client_ip} Pong !")
    return jsonify({"message": "Pong !"}), 200

def start_background_tasks():
    daily_cleanup_thread = threading.Thread(target=cleanup_expired_stats, args=("today",), daemon=True)  
    monthly_cleanup_thread = threading.Thread(target=cleanup_expired_stats, args=("month",), daemon=True)
    pool_monitor_thread = threading.Thread(target=monitor_pool, daemon=True)
    
    daily_cleanup_thread.start()
    monthly_cleanup_thread.start()
    pool_monitor_thread.start()
    
    logger.info("Background tasks started successfully !")


if __name__ == '__main__':    
    # Start the Flask app
    start_background_tasks()
    app.run(host=os.getenv('HOST'), port=os.getenv('MAIN_PORT'))
