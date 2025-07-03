from flask import Flask, request, jsonify, render_template
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

from modules.mood.mood_engine import get_mood
from modules.music.spotify_data import search_track
from modules.music.last_fm_data import get_top_track_for_mood

from modules.ratelimit.ratelimiter import limiter


load_dotenv()

app = Flask(__name__)

redis_connection = redis.Redis(
    host=os.getenv('REDIS_HOST'),
    port=int(os.getenv('REDIS_PORT')),
    db=int(os.getenv('REDIS_DB'))
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

CORS(app, 
     resources={r"/*": {
         "origins": cors_origins,
         "methods": cors_methods,
         "headers": cors_headers,
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
    db=int(os.getenv('REDIS_DB'))
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
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1)

@app.errorhandler(500)
def internal_error(error):
    logger.critical(f"Internal Server Error: {error}")
    return jsonify({'error': 'An internal error occurred'}), 500


@app.errorhandler(429)
def ratelimit_error(error):    
    # Get retry-after from the response if available
    retry_after = None
    if hasattr(error, 'description') and hasattr(error.description, 'headers'):
        retry_after = error.description.headers.get('Retry-After')
    
    logger.warning(f"Rate limit exceeded: {error}")
    
    return jsonify({
        'error': 'Rate limit exceeded',
        'retry_after': retry_after,
    }), 429, {'Retry-After': retry_after} if retry_after else {}


@app.errorhandler(404)
def page_not_found(error):
    logger.warning(f"Page not found: {error}")
    return jsonify({'error': 'Page not found'}), 404

#Basic Root
@app.route('/', methods=['GET'])
@limiter.limit("50 per minute")
def index():
    """
    Serve html page
    """
    cache_buster = datetime.now().strftime("%Y%m%d%H%M%S")
    return render_template('index.htm', cache_buster=cache_buster)

# API Endpoints

@app.route('/mood', methods=['POST'])
@limiter.limit(os.getenv("MOOD_ENDPOINT_LIMIT", "10") + " per minute")
def mood_endpoint():
    """
    Enepoint to analyse mood from user text input
    """

    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"error": "Invalid input"}), 400
    
    text = data['text']
    # Sanitize input to prevent XSS attacks
    text = bleach.clean(text)
    if not text:
        return jsonify({"error": "Text cannot be empty"}), 400
    
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

    return jsonify({
        "dominant_mood": dominant_mood,
        "mood_score": mood_score
    }), 200

@app.route('/music', methods=['POST'])
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
    
    spotify_result = search_track(top_track['track'], top_track['artist'])
    
    if not spotify_result:
        logger.warning(f"Track '{top_track['track']}' by {top_track['artist']} not found on Spotify")
        return jsonify({
            "message": "Track not found on Spotify",
            "last_fm_url": top_track['url']
        }), 404
    
    return jsonify({
        "spotify": spotify_result,
        "last_fm_url": top_track['url']
    }), 200

@app.route('/ping', methods=['GET'])
@limiter.limit(os.getenv("PING_ENDPOINT_LIMIT", "10") + " per minute")
def test_endpoint():
    """Ping endpoint to test server availability"""
    client_ip = request.remote_addr
    logger.info(f"{client_ip} Pong !")
    return jsonify({"message": "Pong !"}), 200

if __name__ == '__main__':    
    # Start the Flask app
    app.run(host=os.getenv('HOST'), port=os.getenv('MAIN_PORT'))
