import os
import certifi
from dotenv import load_dotenv
import mysql.connector
from mysql.connector import Error

load_dotenv()

# 1. Base configuration for the MySQL Server
SERVER_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "ssl_ca": os.getenv("SSL_CA_PATH"),
    "ssl_verify_cert": os.getenv("SSL_VERIFY_CERT", True).lower == "true",
    "ssl_verify_identity": os.getenv("SSL_VERIFY_IDENTITY", True).lower == "true",
    "autocommit": True,
}

DB_NAME = os.getenv("DB_NAME")

# 2. Configuration for the App
DB_CONFIG = {**SERVER_CONFIG, "database": DB_NAME, "autocommit": False}


import time

def get_db_connection(retries=4, delay=1):
    """Returns a connection to the database for use in app endpoints, with retries for serverless wake-ups."""
    # Add a longer connection timeout for serverless DBs (like TiDB) waking up
    config = {**DB_CONFIG, "connect_timeout": 10}
    
    for attempt in range(retries):
        try:
            conn = mysql.connector.connect(**config)
            return conn
        except Error as e:
            print(f"Database connection attempt {attempt + 1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(delay * (attempt + 1))
            else:
                print("All database connection attempts failed.")
                return None
