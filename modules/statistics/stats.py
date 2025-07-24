from datetime import datetime
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
table_name = os.getenv('DB_STATS_TABLE_NAME')

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


def write_stats(dominant_mood):
    timestamp = datetime.now()
    logger.info(f"Writing stats: {dominant_mood} at {timestamp}")
    try:
        with get_db_connection() as connection:
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                f"INSERT INTO {table_name} (mood, timestamp) VALUES (%s, %s)",
                (dominant_mood, timestamp)
            )
            connection.commit()
            logger.info(f"Stats written: {dominant_mood} at {timestamp}")

    except mysql.connector.Error as err:
        logger.error(f"Error writing stats: {err}")
        try:
            connection.rollback()
        except Exception:
            pass

def read_stats():
    try:
        with get_db_connection() as connection:
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                f"""
                SELECT mood, COUNT(*) as mood_count, MAX(timestamp) as last_updated
                FROM {table_name}
                GROUP BY mood
                ORDER BY mood_count DESC, last_updated DESC
                """
            )
            results = cursor.fetchall()
            leaderboard = []
            for row in results:
                leaderboard.append({
                    "mood": row["mood"],
                    "mood_count": row["mood_count"],
                    "last_updated": row["last_updated"]
                })
            return leaderboard
        
    except mysql.connector.Error as err:
        logger.error(f"Error reading stats: {err}")
        return []
    
def cleanup_expired_stats():
    while True:
        #logger.debug("Running expired stats cleanup task")
        try:
            with get_db_connection() as connection:
                cursor = connection.cursor()

                # Delete records older than today
                delete_query = f"""
                    DELETE FROM {table_name}
                    WHERE DATE(timestamp) != CURDATE()
                """
                cursor.execute(delete_query)
                deleted_count = cursor.rowcount

                if deleted_count > 0:
                    connection.commit()
                    logger.info(f"Cleaned up {deleted_count} expired stats records")

        except mysql.connector.Error as err:
            logger.error(f"MySQL error in expired stats cleanup task: {err}")

        except Exception as e:
            logger.error(f"Unexpected error in expired stats cleanup task: {e}")

        finally:
            cursor.close()
            time.sleep(3600)  # every hour

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



    