from datetime import datetime, timedelta
import os
import time
from contextlib import contextmanager
import mysql.connector
from mysql.connector import pooling
import logging

default_connection_pool_settings ={
    "pool_name": os.getenv('DB_POOL_NAME'),
    "pool_size": int(os.getenv('DB_POOL_SIZE')),
    "pool_reset_session": os.getenv('DB_POOL_RESET_SESSION'),
    "host": os.getenv('DB_HOST'),
    "user": os.getenv('DB_USER'),
    "password": os.getenv('DB_PASSWORD'),
    "database": os.getenv('DB_NAME'),
    "connect_timeout": 30,
    "get_warnings": True,
    "autocommit": True,
    "connection_timeout": 15
}
connection_pool = pooling.MySQLConnectionPool(**default_connection_pool_settings)

logging.basicConfig(format='%(asctime)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

file_handler = logging.FileHandler('../app.log')
file_handler.setLevel(logging.DEBUG)
file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)

mood_stats_table = os.getenv('DB_MOOD_STATS_TABLE_NAME')
main_stats_table = os.getenv('DB_MAIN_STATS_TABLE_NAME')

# Context manager for database connections
@contextmanager
def get_db_connection():
    """Get a database connection from the pool and handle errors"""
    connection = None
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            connection = connection_pool.get_connection()
            
            # Test if connection is valid
            cursor = connection.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
            
            yield connection
            break  # If successful, exit the retry loop
            
        except mysql.connector.errors.PoolError as err:
            # No available connections in pool
            retry_count += 1
            logger.warning(f"Pool error on attempt {retry_count}: {err}")
            
            if retry_count >= max_retries:
                logger.error("Connection pool exhausted after retries")
                raise
                
            # Wait before retrying
            time.sleep(0.5 * (2 ** retry_count))
            
        except mysql.connector.errors.InterfaceError as err:
            # Connection interface error
            retry_count += 1
            logger.warning(f"Connection interface error on attempt {retry_count}: {err}")
            
            if retry_count >= max_retries:
                logger.error("Failed to establish working connection after retries")
                raise
                
            time.sleep(0.5 * (2 ** retry_count))
            
        except mysql.connector.Error as err:
            # Other MySQL errors
            logger.error(f"Database error: {err}")
            raise
            
        finally:
            if connection:
                try:
                    connection.close()
                except Exception as e:
                    logger.error(f"Error closing connection: {e}")


def increment_visits_count():
    try:
        with get_db_connection() as connection:
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                f"UPDATE {main_stats_table} SET visits_count = visits_count + 1 WHERE id = 1"
            )
            connection.commit()
            logger.debug("Visits count incremented successfully")
    except mysql.connector.Error as err:
        logger.error(f"Error incrementing visits count: {err}")
        try:
            connection.rollback()
        except Exception:
            pass

def increment_unique_users_count():
    try:
        with get_db_connection() as connection:
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                f"UPDATE {main_stats_table} SET unique_users_count = unique_users_count + 1 WHERE id = 1"
            )
            connection.commit()
            logger.debug("Unique users count incremented successfully")
    except mysql.connector.Error as err:
        logger.error(f"Error incrementing unique users count: {err}")
        try:
            connection.rollback()
        except Exception:
            pass

def increment_shared_songs_count():
    try:
        with get_db_connection() as connection:
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                f"UPDATE {main_stats_table} SET shared_songs_count = shared_songs_count + 1 WHERE id = 1"
            )
            connection.commit()
            logger.debug("Shared songs count incremented successfully")
    except mysql.connector.Error as err:
        logger.error(f"Error incrementing shared songs count: {err}")
        try:
            connection.rollback()
        except Exception:
            pass

def increment_submited_moods_count():
    try:
        with get_db_connection() as connection:
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                f"UPDATE {main_stats_table} SET submited_moods_count = submited_moods_count + 1 WHERE id = 1"
            )
            connection.commit()
            logger.debug("Submited moods count incremented successfully")
    except mysql.connector.Error as err:
        logger.error(f"Error incrementing submited moods count: {err}")
        try:
            connection.rollback()
        except Exception:
            pass

def write_stats(dominant_mood):
    timestamp = datetime.now()
    logger.debug(f"Writing stats: {dominant_mood} at {timestamp}")
    mood_columns = ['angry', 'disgusted', 'scared', 'joy', 'sad', 'surprised']

    # Normalize mood key
    mood_map = {
        "anger": "angry",
        "angry": "angry",
        "disgust": "disgusted",
        "disgusted": "disgusted",
        "fear": "scared",
        "scared": "scared",
        "joy": "joy",
        "happy": "joy",
        "sadness": "sad",
        "sad": "sad",
        "surprise": "surprised",
        "surprised": "surprised"
    }
    normalized_mood = mood_map.get(dominant_mood.lower())
    if normalized_mood not in mood_columns:
        logger.warning(f"Unknown mood '{dominant_mood}' (normalized: '{normalized_mood}') - not updating stats")
        return
    try:
        with get_db_connection() as connection:
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                f"UPDATE {mood_stats_table} SET {normalized_mood} = {normalized_mood} + 1, last_updated = %s WHERE id = 1",
                (timestamp,)
            )
            connection.commit()
            logger.info(f"Stats updated: {normalized_mood} at {timestamp}")

    except mysql.connector.Error as err:
        logger.error(f"Error writing stats: {err}")
        try:
            connection.rollback()
        except Exception:
            pass

def read_stats():
    mood_columns = ['angry', 'disgusted', 'scared', 'joy', 'sad', 'surprised']
    try:
        with get_db_connection() as connection:
            cursor = connection.cursor(dictionary=True)
            # Get mood stats from the single row
            cursor.execute(
                f"SELECT {', '.join(mood_columns)}, last_updated FROM {mood_stats_table} WHERE id = 1"
            )
            row = cursor.fetchone()
            if not row:
                return {
                    "message": "No statistics available yet. Please check back later."
                }
            stats = {mood: {"count": row.get(mood, 0) or 0} for mood in mood_columns}
            last_updated = row.get("last_updated")

            # Get visits and unique users counters
            cursor.execute(
                f"""SELECT visits_count, unique_users_count, shared_songs_count, submited_moods_count
                    FROM {main_stats_table} LIMIT 1"""
            )
            main_stats = cursor.fetchone()
            visits_count = main_stats["visits_count"] if main_stats and "visits_count" in main_stats else 0
            unique_users_count = main_stats["unique_users_count"] if main_stats and "unique_users_count" in main_stats else 0
            shared_songs_count = main_stats["shared_songs_count"] if main_stats and "shared_songs_count" in main_stats else 0
            submited_moods_count = main_stats["submited_moods_count"] if main_stats and "submited_moods_count" in main_stats else 0

            return {
                "stats": stats,
                "last_updated": last_updated,
                "visits_count": visits_count,
                "unique_users_count": unique_users_count,
                "submited_moods_count": submited_moods_count,
                "shared_songs_count": shared_songs_count
            }

    except mysql.connector.Error as err:
        logger.error(f"Error reading stats: {err}")
        return {"stats": {}, "last_updated": None, "visits_count": 0, "unique_users_count": 0}

def cleanup_expired_stats():
    mood_columns = ['angry', 'disgusted', 'scared', 'joy', 'sad', 'surprised']
    while True:
        
        try:
            with get_db_connection() as connection:
                cursor = connection.cursor()
                # Reset all mood columns to 0 and update last_updated
                reset_query = f"""
                    UPDATE {mood_stats_table}
                    SET {', '.join([f"{mood} = 0" for mood in mood_columns])}, last_updated = %s
                    WHERE id = 1
                """
                cursor.execute(reset_query, (datetime.now(),))
                connection.commit()
                logger.info("Mood stats reset to 0 for all moods")

        except mysql.connector.Error as err:
            logger.error(f"MySQL error in expired stats cleanup task: {err}")

        except Exception as e:
            logger.error(f"Unexpected error in expired stats cleanup task: {e}")

        finally:
            try:
                cursor.close()
            except Exception:
                pass

        # Calculate seconds until next midnight
        now = datetime.now()
        next_midnight = (now.replace(hour=0, minute=0, second=0, microsecond=0)
                         + timedelta(days=1))
        seconds_until_midnight = (next_midnight - now).total_seconds()
        logger.info(f"Sleeping {seconds_until_midnight:.0f} seconds until next cleanup at midnight")
        time.sleep(seconds_until_midnight)

def monitor_pool():
    last_used = 0
    while True:
        try:
            if hasattr(connection_pool, '_cnx_queue'):
                available = connection_pool._cnx_queue.qsize()
                total = int(os.getenv('DB_POOL_SIZE'))
                used = total - available
                
                # Potential connection leak
                if used > last_used + 3:  # Sudden increase in used connections
                    logger.warning(f"Potential connection leak detected! Used connections jumped from {last_used} to {used}")
                
                last_used = used
                #logger.info(f"Connection pool status - Used: {used}, Available: {available}, Total: {total}") # Uncomment for debugging
                
                # Alert on low available connections
                if available < total * 0.2:  # 20% threshold
                    logger.warning(f"Connection pool running low!! Only {available} connections available !!")

        except Exception as e:
            logger.error(f"Pool monitoring error: {e}")
        time.sleep(30)

def reset_connection_pool():
    global connection_pool
    logger.warning("Attempting to reset connection pool")
    try:
        # Create new pool
        connection_pool = pooling.MySQLConnectionPool(**default_connection_pool_settings)
        logger.info("Connection pool successfully reset")

    except Exception as e:
        logger.critical(f"Failed to reset connection pool: {e}")