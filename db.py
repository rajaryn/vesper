import os
import certifi
from dotenv import load_dotenv
import mysql.connector
from mysql.connector import Error

load_dotenv()

# 1. Base configuration for the MySQL Server
SERVER_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", 4000)),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "ssl_ca": certifi.where(),
    "ssl_verify_cert": True,
    "ssl_verify_identity": True,
    "autocommit": True,
}

DB_NAME = os.getenv("DB_NAME")

# 2. Configuration for the App
DB_CONFIG = {**SERVER_CONFIG, "database": DB_NAME, "autocommit": False}


def init_db():
    """Creates the database and tables if they do not exist."""
    print("Initializing database setup...")

    # Step 1: Create the database
    try:
        server_conn = mysql.connector.connect(**SERVER_CONFIG)
        cursor = server_conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
        cursor.close()
        server_conn.close()
        print(f"Database '{DB_NAME}' is ready.")
    except Error as e:
        print(f"Error creating database: {e}")
        return

    # Step 2: Create the tables inside the database
    try:
        db_conn = mysql.connector.connect(**DB_CONFIG)
        cursor = db_conn.cursor()

        # Create pins table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS pins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lat DECIMAL(8, 3) NOT NULL,
            lon DECIMAL(9, 3) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_location (lat, lon)
        )
        """)

        # Create images table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS images (
            id INT AUTO_INCREMENT PRIMARY KEY,
            pin_id INT NOT NULL,
            file_path VARCHAR(255) NOT NULL,
            capture_type VARCHAR(10) DEFAULT 'sun',
            uploaded_at TIMESTAMP,
            FOREIGN KEY (pin_id) REFERENCES pins(id) ON DELETE CASCADE,
            INDEX (pin_id)
        )
        """)

        db_conn.commit()
        cursor.close()
        db_conn.close()
        print("✅ Tables 'pins' and 'images' are ready.")

    except Error as e:
        print(f"Error creating tables: {e}")


import time

def get_db_connection(retries=3, delay=2):
    """Returns a connection to the database for use in app endpoints, with retries for serverless wake-ups."""
    # Add a longer connection timeout for serverless DBs (like TiDB) waking up
    config = {**DB_CONFIG, "connect_timeout": 30}
    
    for attempt in range(retries):
        try:
            conn = mysql.connector.connect(**config)
            return conn
        except Error as e:
            print(f"Database connection attempt {attempt + 1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                print("All database connection attempts failed.")
                return None


if __name__ == "__main__":
    init_db()
