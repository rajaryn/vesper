import os
import io
import hmac
import math
import heapq
import urllib.request
import urllib.error
from datetime import datetime, timezone
from flask import Flask, Response, request, jsonify, render_template, send_from_directory 
from flask import make_response
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from PIL import Image
from db import get_db_connection
import cloudinary
import cloudinary.uploader
from functools import wraps
from dotenv import load_dotenv

# NEW: Import your modular image utility
from image_utils import convert_heic_to_jpg

# Load environment variables
load_dotenv()

app = Flask(__name__)
# Same-origin front end: CORS is intentionally not enabled.

# Trust one proxy hop so rate limiting sees the real client IP
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

limiter = Limiter(get_remote_address, app=app, default_limits=["300 per hour", "60 per minute"])

Image.MAX_IMAGE_PIXELS = 50_000_000  # Guard against decompression bombs

@app.after_request
def add_security_headers(resp):
    resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resp.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
    resp.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    resp.headers.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    return resp

# Cloudinary Configuration
cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET')
)

app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 # Limit uploads to 5MB

# Helper: Haversine distance
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# --- ADMIN AUTHENTICATION SECURITY ---
def check_auth(username, password):
    """Check if a username / password combination is valid."""
    correct_username = os.getenv('ADMIN_USERNAME')
    correct_password = os.getenv('ADMIN_PASSWORD')
    # Admin is disabled entirely unless both credentials are configured
    if not correct_username or not correct_password:
        return False
    user_ok = hmac.compare_digest((username or '').encode(), correct_username.encode())
    pass_ok = hmac.compare_digest((password or '').encode(), correct_password.encode())
    return user_ok and pass_ok

def authenticate():
    """Sends a 401 response that enables basic auth"""
    return Response(
    'Access Denied. Please log in with admin credentials.', 401,
    {'WWW-Authenticate': 'Basic realm="Admin Dashboard"'})

def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated

# Helper: Extract Cloudinary Public ID from URL
def get_cloudinary_public_id(url):
    try:
        parts = url.split('/upload/')
        if len(parts) == 2:
            path_parts = parts[1].split('/')
            if path_parts[0].startswith('v') and path_parts[0][1:].isdigit():
                path_parts = path_parts[1:]
            
            file_name_with_ext = path_parts[-1]
            file_name = file_name_with_ext.rsplit('.', 1)[0]
            path_parts[-1] = file_name
            
            return '/'.join(path_parts)
    except Exception as e:
        print(f"Error parsing Cloudinary URL: {e}")
    return None

@app.errorhandler(500)
def server_error(e):
    return render_template('offline.html'), 500

@app.route('/offline.html')
def offline():
    return render_template('offline.html')


# A super lightweight endpoint for pinging services to keep the server awake
@app.route('/wake', methods=['GET'])
def wake_up():
    # Warm the TiDB connection too, so the first real request after idle isn't slow
    conn = get_db_connection()
    if conn:
        conn.close()
    return jsonify({"message": "The sky is awake."}), 200

# --- Frontend Serving Routes ---


@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/privacy')
def privacy():
    return render_template('privacy.html')

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/service_worker.js')
def serve_sw():
    response = make_response(send_from_directory('static', 'service_worker.js'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

@app.route('/images/<path:filename>')
def custom_static(filename):
    return send_from_directory('static/images', filename)

import urllib3
import os

http_pool = urllib3.PoolManager(maxsize=20)
TILES_CACHE_DIR = os.path.join('static', 'tiles')
os.makedirs(TILES_CACHE_DIR, exist_ok=True)
MAX_CACHED_TILES = 20000

# Carto Basemap Tile Proxy (protects CARTO_API_KEY on the backend)
@app.route('/tiles/<int:z>/<int:x>/<int:y>.png', methods=['GET'])
def tile_proxy(z, x, y):
    if not (0 <= z <= 19 and 0 <= x < 2**z and 0 <= y < 2**z):
        return Response("Invalid tile", status=400, mimetype="text/plain")

    # 1. Check local disk cache first (blazing fast)
    tile_filename = f"{z}_{x}_{y}.png"
    tile_path = os.path.join(TILES_CACHE_DIR, tile_filename)
    
    if os.path.exists(tile_path):
        resp = make_response(send_from_directory(TILES_CACHE_DIR, tile_filename))
        resp.headers['Cache-Control'] = 'public, max-age=864000'
        return resp

    # 2. If not cached, fetch from Carto
    carto_key = os.getenv('CARTO_API_KEY', '')
    subdomain = ['a', 'b', 'c', 'd'][(x + y) % 4]
    url = f"https://{subdomain}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
    if carto_key:
        url += f"?key={carto_key}"
    
    try:
        response = http_pool.request('GET', url, headers={"User-Agent": "Vesper/1.0"}, timeout=5.0)
        if response.status == 200:
            # Save to disk cache for future requests (bounded so it can't fill the disk)
            try:
                if len(os.listdir(TILES_CACHE_DIR)) < MAX_CACHED_TILES:
                    with open(tile_path, 'wb') as f:
                        f.write(response.data)
            except OSError as e:
                print(f"Tile cache write failed: {e}")
                
            resp = make_response(response.data)
            resp.headers['Content-Type'] = 'image/png'
            resp.headers['Cache-Control'] = 'public, max-age=864000'
            return resp
        else:
            return Response("Tile not found", status=response.status, mimetype="text/plain")
    except Exception as e:
        print(f"Tile proxy error: {type(e).__name__}")
        return Response("Tile unavailable", status=502, mimetype="text/plain")

@app.route('/upload', methods=['POST'])
@limiter.limit("5 per hour; 2 per minute")
def upload():
    # 1. Input Validation
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    file = request.files['image']
    lat_str = request.form.get('lat')
    lon_str = request.form.get('lon')
    capture_type = request.form.get('capture_type', 'sun')
    if capture_type not in ('sun', 'moon'):
        return jsonify({'error': 'Invalid capture type'}), 400
    
    # Grab the historical EXIF time from the frontend (if it exists)
    captured_at_str = request.form.get('captured_at')
    if captured_at_str:
        try:
            # Clean possible ISO format: '2023-10-05T14:48:00.000Z', '2023-10-05T14:48:00Z', or '2023-10-05 14:48:00'
            cleaned_time_str = captured_at_str.replace('Z', '').replace('z', '').split('.')[0].replace('T', ' ').strip()
            # Validate and normalize the format
            parsed_time = datetime.strptime(cleaned_time_str, '%Y-%m-%d %H:%M:%S')
            final_time = parsed_time.strftime('%Y-%m-%d %H:%M:%S')
        except ValueError as e:
            print(f"Date parsing failed for '{captured_at_str}': {e}")
            # Fallback if parsing fails
            final_time = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    else:
        final_time = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S') # Uses current date

    if not file or file.filename == '' or not lat_str or not lon_str:
        return jsonify({'error': 'Missing required data'}), 400

    try:
        lat = round(float(lat_str), 3)
        lon = round(float(lon_str), 3)
    except ValueError:
        return jsonify({'error': 'Invalid coordinates format'}), 400

    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({'error': 'Coordinates out of range'}), 400

    # Verify the bytes really are an image (extension alone is not trusted)
    ext = os.path.splitext(file.filename.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': 'Unsupported file type'}), 400
    if ext not in ('.heic', '.heif'):
        try:
            Image.open(file.stream).verify()
        except Exception:
            return jsonify({'error': 'File is not a valid image'}), 400
        finally:
            file.stream.seek(0)

   
    # 2. Process & Upload to Cloudinary
    try:
        filename_lower = file.filename.lower()
        
        # ⚡️ Modular HEIC Processing
        if filename_lower.endswith('.heic') or filename_lower.endswith('.heif'):
            processed_file = convert_heic_to_jpg(file)
            
            if not processed_file:
                return jsonify({'error': 'Failed to process HEIC/HEIF image locally'}), 500
                
            upload_target = processed_file
        else:
            upload_target = file

        upload_result = cloudinary.uploader.upload(
            upload_target,
            folder="catchmesunsets", 
            resource_type="image",
            format="jpg", # Force everything to be a universal JPEG
            transformation=[
                {'width': 1080, 'crop': 'limit'}, # Shrinks massive photos, leaves small ones alone
                {'quality': 'auto'} # Compresses file size without losing visible quality
            ]
        )
        image_url = upload_result.get('secure_url')
    except Exception as e:
        print(f"UPLOAD/PROCESSING ERROR: {e}") 
        return jsonify({'error': 'Upload or processing failed'}), 500

    # 3. Database Transaction
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = conn.cursor(dictionary=True)
    try:
        # Check if pin exists
        cursor.execute("SELECT id FROM pins WHERE lat = %s AND lon = %s", (lat, lon))
        pin = cursor.fetchone()

        if pin:
            pin_id = pin['id']
        else:
            # Create new pin
            cursor.execute("INSERT INTO pins (lat, lon) VALUES (%s, %s)", (lat, lon))
            pin_id = cursor.lastrowid


        # Insert the image with the explicitly defined time
        cursor.execute(
            "INSERT INTO images (pin_id, file_path, capture_type, uploaded_at) VALUES (%s, %s, %s, %s)",
            (pin_id, image_url, capture_type, final_time)
        )

        conn.commit()
        return jsonify({'message': 'Upload successful', 'pin_id': pin_id}), 201

    except Exception as e:
        conn.rollback()
        print(f"DB TRANSACTION ERROR: {e}")
        return jsonify({'error': 'Database transaction failed'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/pins', methods=['GET'])
def get_pins():
    lat = request.args.get('lat')
    lon = request.args.get('lon')

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = conn.cursor(dictionary=True)

    try:
        if lat and lon:
            query = """
                SELECT p.id, p.lat, p.lon, p.created_at, MAX(i.uploaded_at) as last_upload_at,
                ( 3959 * acos( cos( radians(%s) ) * cos( radians( p.lat ) ) * cos( radians( p.lon ) - radians(%s) ) + sin( radians(%s) ) * sin( radians( p.lat ) ) ) ) AS distance 
                FROM pins p
                LEFT JOIN images i ON p.id = i.pin_id
                GROUP BY p.id
                ORDER BY distance 
                LIMIT 100
            """
            cursor.execute(query, (float(lat), float(lon), float(lat)))
        else:
            query = """
                SELECT p.id, p.lat, p.lon, p.created_at, MAX(i.uploaded_at) as last_upload_at 
                FROM pins p
                LEFT JOIN images i ON p.id = i.pin_id
                GROUP BY p.id
                ORDER BY last_upload_at DESC 
                LIMIT 200
            """
            cursor.execute(query)

        pins = cursor.fetchall()
        
        for pin in pins:
            if pin.get('created_at') and hasattr(pin['created_at'], 'isoformat'):
                pin['created_at'] = pin['created_at'].isoformat()
            if pin.get('last_upload_at') and hasattr(pin['last_upload_at'], 'isoformat'):
                pin['last_upload_at'] = pin['last_upload_at'].isoformat()

        return jsonify(pins), 200

    except Exception as e:
        print(f"DB ERROR: {e}")
        return jsonify({'error': 'Failed to fetch pins'}), 500
    finally:
        cursor.close()
        conn.close()
        
@app.route('/pins/<int:pin_id>', methods=['GET'])
def get_gallery(pin_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT id, file_path, uploaded_at, capture_type FROM images WHERE pin_id = %s ORDER BY uploaded_at DESC",
            (pin_id,)
        )
        images = cursor.fetchall()
        
        for img in images:
            if isinstance(img['uploaded_at'], datetime):
                img['uploaded_at'] = img['uploaded_at'].isoformat() 
                
        return jsonify(images), 200
    except Exception as e:
        print(f"DB ERROR: {e}")
        return jsonify({'error': 'Failed to fetch images'}), 500
    finally:
        cursor.close()
        conn.close()
        
# --- ADMIN & MODERATION ROUTES ---

@app.route('/admin')
@limiter.limit("20 per minute")
@requires_auth
def admin_page():
    return render_template('admin.html')

@app.route('/admin/image/<int:image_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
@requires_auth
def delete_image(image_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT file_path FROM images WHERE id = %s", (image_id,))
        img = cursor.fetchone()
        
        if img:
            public_id = get_cloudinary_public_id(img['file_path'])
            if public_id:
                cloudinary.uploader.destroy(public_id)
            
            cursor.execute("DELETE FROM images WHERE id = %s", (image_id,))
            conn.commit()
            return jsonify({"status": "success"}), 200
        else:
            return jsonify({"error": "Image not found"}), 404
            
    except Exception as e:
        conn.rollback()
        print(f"ADMIN DELETE ERROR: {e}")
        return jsonify({'error': 'Delete failed'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/admin/pin/<int:pin_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
@requires_auth
def delete_pin(pin_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT file_path FROM images WHERE pin_id = %s", (pin_id,))
        images = cursor.fetchall()
        
        cursor.execute("DELETE FROM pins WHERE id = %s", (pin_id,))
        conn.commit()

        # Remove remote files only after the DB delete succeeded
        for img in images:
            public_id = get_cloudinary_public_id(img['file_path'])
            if public_id:
                try:
                    cloudinary.uploader.destroy(public_id)
                except Exception as e:
                    print(f"Cloudinary cleanup failed for {public_id}: {e}")
        
        return jsonify({"status": "success"}), 200
        
    except Exception as e:
        conn.rollback()
        print(f"ADMIN DELETE ERROR: {e}")
        return jsonify({'error': 'Delete failed'}), 500
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    app.run(debug=os.getenv('FLASK_DEBUG') == '1')