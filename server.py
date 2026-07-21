#!/usr/bin/env python3
"""Single HTTP server: serves static files + API for MPD streams."""
import json, re, urllib.request, base64, ssl, http.server, os, sys

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

BASE_DIR = os.path.dirname(__file__)
CHANNELS_PATH = os.path.join(BASE_DIR, 'channels', 'channels.json')

with open(CHANNELS_PATH) as f:
    CHANNELS = json.load(f)

MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
}

def fetch(url, timeout=10):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://bestleague.top/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        })
        return urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX).read()
    except Exception as e:
        sys.stderr.write(f"[fetch] {url[:50]}: {e}\n")
        sys.stderr.flush()
        return None

def get_mpd(b64):
    html = fetch(f"https://bestleague.top/tok.html?get={b64}")
    if not html: return {"error": "no response"}
    html = html.decode()
    
    try: name_decoded = base64.b64decode(b64 + '==').decode('utf-8', errors='replace').rstrip('\x00')
    except: name_decoded = b64
    
    mt_match = re.search(r'var mt = (\[[\s\S]*?\]);', html)
    if not mt_match: return {"error": "no CDN data"}
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
                return {"name": ch_name, "url": mpd_url, "type": "mpd", "keyId": kid, "key": k}
        except: continue
    return {"error": "all CDNs failed"}

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        
        # API endpoints
        if path == '/api/channels':
            self.json_response(CHANNELS)
        elif path == '/api/mpd':
            b64 = self.path.split('b64=')[1].split('&')[0] if 'b64=' in self.path else ''
            result = get_mpd(b64)
            self.json_response(result)
        elif path == '/api/ping':
            self.json_response({"ok": True, "channels": len(CHANNELS)})
        else:
            self.serve_static(path)
    
    def json_response(self, data):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def serve_static(self, path):
        if path == '/': path = '/index.html'
        filepath = os.path.join(BASE_DIR, path.lstrip('/'))
        filepath = os.path.normpath(filepath)
        
        if not filepath.startswith(BASE_DIR):
            self.send_error(403)
            return
        
        if not os.path.isfile(filepath):
            # Fallback to index.html for SPA
            filepath = os.path.join(BASE_DIR, 'index.html')
        
        ext = os.path.splitext(filepath)[1]
        content_type = MIME_TYPES.get(ext, 'application/octet-stream')
        
        try:
            with open(filepath, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(data)
        except:
            self.send_error(404)
    
    def log_message(self, fmt, *args):
        sys.stderr.write(f"[{self.address_string()}] {args[0]} {args[1]} {args[2]}\n")
        sys.stderr.flush()

PORT = int(os.environ.get('PORT', 80))
httpd = http.server.HTTPServer(('0.0.0.0', PORT), Handler)
sys.stderr.write(f"Server on port {PORT}\n")
sys.stderr.flush()
httpd.serve_forever()
