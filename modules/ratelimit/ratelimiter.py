import os
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

redis_host = os.getenv('REDIS_HOST')
redis_port = os.getenv('REDIS_PORT')
redis_db = os.getenv('REDIS_DB', '0')
redis_password = os.getenv('REDIS_PASSWORD')

if not redis_host or not redis_port:
    raise ValueError("REDIS_HOST and REDIS_PORT environment variables are required")

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=f"redis://default:{redis_password}@{redis_host}:{int(redis_port)}/{redis_db}"
)