import requests
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

client_id = os.getenv('SPOTIFY_CLIENT_ID')
client_secret = os.getenv('SPOTIFY_CLIENT_SECRET')

def get_spotify_token():
    response = requests.post(
        "https://accounts.spotify.com/api/token",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "client_credentials",
            "client_id": {client_id},
            "client_secret": {client_secret}
        }
    )
    response = response.json()
    return response.get("access_token")