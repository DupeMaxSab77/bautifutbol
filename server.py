from flask import Flask, jsonify, send_from_directory, request
import json, re, urllib.request, base64, ssl, os, sys

app = Flask(__name__, static_folder=None)

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

BASE_DIR = os.path.dirname(__file__)

with open(os.path.join(BASE_DIR, 'channels', 'channels.json')) as f:
    CHANNELS = json.load(f)

def fetch(url, timeout=10):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://bestleague.top/',
        })
        return urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX).read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"[fetch] {url[:60]}: {e}", flush=True)
        return None

@app.route('/api/channels')
def api_channels():
    return jsonify(CHANNELS)

@app.route('/api/ping')
def api_ping():
    return jsonify({"ok": True, "channels": len(CHANNELS)})

@app.route('/api/mpd')
def api_mpd():
    b64 = request.args.get('b64', '')
    if not b64:
        return jsonify({"error": "missing b64"})
    
    html = fetch(f"https://bestleague.top/tok.html?get={b64}")
    if not html:
        return jsonify({"error": "no response from tok.html"})
    
    try:
        name_decoded = base64.b64decode(b64 + '==').decode('utf-8', errors='replace').rstrip('\x00')
    except:
        name_decoded = b64
    
    mt_match = re.search(r'var mt = (\[[\s\S]*?\]);', html)
    if not mt_match:
        return jsonify({"error": "no CDN data in response"})
    
    mt = json.loads(mt_match.group(1))
    num = 3
    m = re.search(r'else\s*\n\s*number\s*=\s*(\d+)', html)
    if m: num = int(m.group(1))
    
    esc = re.escape(b64.rstrip('='))
    key_m = re.search(rf'getURL\s*==\s*["\'][^"\']*{esc[:10]}[^"\']*["\'].*?keyId\s*=\s*["\']([^"\']+)["\'];?\s*key\s*=\s*["\']([^"\']+)["\']', html, re.DOTALL)
    kid = key_m.group(1) if key_m else ''
    k = key_m.group(2) if key_m else ''
    
    for sel in mt:
        mpd_url = f"https://{sel['cdn']}.cvattv.com.ar/{sel['token']}/live/c{num}eds/{name_decoded}/SA_Live_dash_enc/{name_decoded}.mpd"
        try:
            req = urllib.request.Request(mpd_url, headers={'User-Agent': 'Mozilla/5.0'})
            resp = urllib.request.urlopen(req, timeout=5, context=SSL_CTX)
            if resp.status == 200 and b'<MPD' in resp.read(500):
                ch_name = name_decoded
                for ch in CHANNELS:
                    if ch.get('b64') == b64:
                        ch_name = ch['name']
                        break
                return jsonify({"name": ch_name, "url": mpd_url, "type": "mpd", "keyId": kid, "key": k})
        except:
            continue
    
    return jsonify({"error": "all CDNs failed"})

@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    try:
        return send_from_directory(BASE_DIR, path)
    except:
        return send_from_directory(BASE_DIR, 'index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 80))
    print(f"Server on port {port}", flush=True)
    app.run(host='0.0.0.0', port=port)
