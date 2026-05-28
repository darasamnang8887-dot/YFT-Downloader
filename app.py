import os
import re
import socket
import tempfile
import uuid
import glob
import time
from flask import Flask, request, jsonify, send_file, render_template, send_from_directory
from flask_cors import CORS
import yt_dlp
import imageio_ffmpeg

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Ensure temp directory exists for downloads
TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_downloads')
os.makedirs(TEMP_DIR, exist_ok=True)

# Regex patterns for validation (YouTube, Facebook, TikTok only)
YOUTUBE_REGEX = re.compile(
    r'^(https?://)?(www\.|m\.|music\.)?(youtube\.com/watch\?v=|youtube\.com/embed/|youtube\.com/v/|youtu\.be/|youtube\.com/shorts/)[a-zA-Z0-9_-]+'
)
FACEBOOK_REGEX = re.compile(
    r'^(https?://)?(www\.|web\.|m\.|fb\.)?(facebook\.com|fb\.watch|fb\.gg)/.+'
)
TIKTOK_REGEX = re.compile(
    r'^(https?://)?(www\.|vm\.|vt\.|v\.)?tiktok\.com/.+'
)

def validate_url(url):
    if YOUTUBE_REGEX.match(url):
        return 'youtube'
    elif FACEBOOK_REGEX.match(url):
        return 'facebook'
    elif TIKTOK_REGEX.match(url):
        return 'tiktok'
    return None

def clean_old_temp_files():
    """Delete temporary files older than 10 minutes to avoid cluttering Windows filesystem."""
    try:
        now = time.time()
        for filepath in glob.glob(os.path.join(TEMP_DIR, '*')):
            if os.path.isfile(filepath):
                # If file is older than 600 seconds (10 minutes)
                if os.stat(filepath).st_mtime < now - 600:
                    try:
                        os.remove(filepath)
                    except Exception:
                        pass
    except Exception as e:
        print(f"Error cleaning old temp files: {e}")

def get_local_ip():
    """Get the local network IP address of the PC hosting the server."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to connect to anything, just triggers socket config
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

@app.route('/')
def home():
    clean_old_temp_files()
    local_ip = get_local_ip()
    return render_template('index.html', local_ip=local_ip)

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js')

@app.route('/api/info', methods=['POST'])
def get_video_info():
    clean_old_temp_files()
    data = request.json or {}
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({'error': 'សូមបញ្ចូលអាសយដ្ឋាន URL (Please enter a URL)'}), 400
        
    platform = validate_url(url)
    if not platform:
        return jsonify({'error': 'កម្មវិធីនេះគាំទ្រតែ YouTube, Facebook និង TikTok ប៉ុណ្ណោះ! (Only YouTube, Facebook, and TikTok are supported!)'}), 400

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'ffmpeg_location': ffmpeg_exe,
        'extractor_args': {
            'youtube': {
                'player_client': ['ios']
            }
        }
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Formulate friendly download options
            title = info.get('title', 'Video Download')
            duration_sec = info.get('duration')
            duration = ""
            if duration_sec:
                mins = duration_sec // 60
                secs = duration_sec % 60
                duration = f"{mins:02d}:{secs:02d}"
            else:
                duration = "Unknown"
                
            thumbnail = info.get('thumbnail') or info.get('thumbnails', [{}])[0].get('url', '')
            uploader = info.get('uploader') or info.get('creator') or platform.capitalize()
            
            # Build formats lists
            formats_list = []
            
            # 1. Best Quality (Video + Audio combined)
            formats_list.append({
                'id': 'best',
                'label': 'កម្រិតច្បាស់បំផុត (Best Quality)',
                'ext': 'mp4',
                'type': 'video'
            })
            
            # 2. HD Quality (720p if possible)
            formats_list.append({
                'id': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
                'label': 'កម្រិតច្បាស់ HD 720p (HD Quality)',
                'ext': 'mp4',
                'type': 'video'
            })

            # 3. SD Quality (480p if possible)
            formats_list.append({
                'id': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
                'label': 'កម្រិតមធ្យម 480p (Standard Quality)',
                'ext': 'mp4',
                'type': 'video'
            })

            # 4. Audio Only MP3
            formats_list.append({
                'id': 'bestaudio',
                'label': 'ទាញយកតែសំឡេង MP3 (Audio Only)',
                'ext': 'mp3',
                'type': 'audio'
            })
            
            return jsonify({
                'title': title,
                'duration': duration,
                'thumbnail': thumbnail,
                'uploader': uploader,
                'platform': platform,
                'formats': formats_list
            })
            
    except Exception as e:
        print(f"Error fetching info: {e}")
        return jsonify({'error': f'មិនអាចទាញយកព័ត៌មានវីដេអូបានទេ សូមពិនិត្យតំណភ្ជាប់ម្តងទៀត។ (Failed to retrieve video metadata. Error: {str(e)[:100]})'}), 500

@app.route('/api/download', methods=['POST'])
def download_video():
    clean_old_temp_files()
    data = request.json or {}
    url = data.get('url', '').strip()
    format_id = data.get('format_id', 'best')
    
    if not url:
        return jsonify({'error': 'សូមបញ្ចូលអាសយដ្ឋាន URL (URL is required)'}), 400
        
    platform = validate_url(url)
    if not platform:
        return jsonify({'error': 'កម្មវិធីនេះគាំទ្រតែ YouTube, Facebook និង TikTok ប៉ុណ្ណោះ!'}), 400
        
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    
    # Create a unique filename prefix to avoid conflicts
    unique_id = str(uuid.uuid4())
    output_template = os.path.join(TEMP_DIR, f"{unique_id}_%(title)s.%(ext)s")
    
    ydl_opts = {
        'ffmpeg_location': ffmpeg_exe,
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['ios']
            }
        }
    }
    
    # Custom options based on formats selected
    if format_id == 'bestaudio':
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        })
    else:
        ydl_opts.update({
            'format': format_id,
            'merge_output_format': 'mp4',
        })
        
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Download the file locally to our server
            info = ydl.extract_info(url, download=True)
            
            # Find the actual downloaded file on disk
            # Since postprocessors can change extensions (e.g. audio to mp3),
            # we scan the temp directory for the file starting with our unique_id
            downloaded_files = glob.glob(os.path.join(TEMP_DIR, f"{unique_id}_*"))
            
            if not downloaded_files:
                return jsonify({'error': 'ការទាញយកបានបរាជ័យលើម៉ាស៊ីនបម្រើ (Download failed on server)'}), 500
                
            filepath = downloaded_files[0]
            filename = os.path.basename(filepath)
            
            # Strip the unique ID prefix from the filename sent to user
            clean_filename = filename.replace(f"{unique_id}_", "")
            
            # Stream the file back to the browser (mobile or desktop)
            # This triggers a download on their native browser!
            return send_file(
                filepath,
                as_attachment=True,
                download_name=clean_filename,
                mimetype='application/octet-stream'
            )
            
    except Exception as e:
        print(f"Error downloading: {e}")
        return jsonify({'error': f'ការទាញយកបានបរាជ័យ (Download failed: {str(e)[:100]})'}), 500

if __name__ == '__main__':
    local_ip = get_local_ip()
    port = int(os.environ.get('PORT', 5000))
    print("=" * 60)
    print("YFT DOWNLOADER RUNNING SUCCESSFULLY!")
    print(f"Local Access:   http://localhost:{port}")
    print(f"Android Access: http://{local_ip}:{port}")
    print("=" * 60)
    # Bind to 0.0.0.0 to allow access from local Android phones on the network
    app.run(host='0.0.0.0', port=port, debug=True)
