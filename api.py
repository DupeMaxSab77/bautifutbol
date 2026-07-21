#!/usr/bin/env python3
"""API server that fetches fresh streaming URLs on demand."""
import json, re, urllib.request, base64, ssl, http.server, sys

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def fetch(url, timeout=8):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://la20hd.com/'})
        return urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx).read().decode('utf-8', errors='replace')
    except: return ''

# Load channels.json for static data (names, keys)
with open('/usr/share/nginx/html/channels/channels.json') as f:
    channel_index = json.load(f)

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        
        try:
            if self.path.startswith('/api/mpd?b64='):
                b64 = self.path.split('b64=')[1]
                result = self.serve_mpd(b64)
            elif self.path.startswith('/api/hls?name='):
                name = self.path.split('name=')[1]
                result = self.serve_hls(name)
            elif self.path == '/api/channels':
                result = json.dumps(channel_index)
            else:
                result = json.dumps({"error": "unknown endpoint"})
        except Exception as e:
            result = json.dumps({"error": str(e)})
        
        self.wfile.write(result.encode())
    
    def serve_mpd(self, b64):
        html = fetch(f"https://bestleague.top/tok.html?get={b64}")
        if not html:
            return json.dumps({"error": "no response from tok.html"})
        
        name_decoded = base64.b64decode(b64 + '==').decode('utf-8', errors='replace').rstrip('\x00')
        mt_match = re.search(r'var mt = (\[[\s\S]*?\]);', html)
        if not mt_match:
            return json.dumps({"error": "no mt array"})
        
        mt = json.loads(mt_match.group(1))
        num = 3
        m = re.search(r'else\s*\n\s*number\s*=\s*(\d+)', html)
        if m: num = int(m.group(1))
        
        # Extract keys
        esc = re.escape(b64.rstrip('='))
        key_m = re.search(rf'getURL\s*==\s*["\'][^"\']*{esc[:10]}[^"\']*["\'].*?keyId\s*=\s*["\']([^"\']+)["\'];?\s*key\s*=\s*["\']([^"\']+)["\']', html, re.DOTALL)
        kid = key_m.group(1) if key_m else ''
        k = key_m.group(2) if key_m else ''
        
        # Try CDNs until one works
        for sel in mt:
            mpd_url = f"https://{sel['cdn']}.cvattv.com.ar/{sel['token']}/live/c{num}eds/{name_decoded}/SA_Live_dash_enc/{name_decoded}.mpd"
            try:
                req = urllib.request.Request(mpd_url, headers={'User-Agent': 'Mozilla/5.0'})
                resp = urllib.request.urlopen(req, timeout=5, context=ssl_ctx)
                if resp.status == 200 and b'<MPD' in resp.read(500):
                    # Find the channel in index for name
                    ch_name = name_decoded
                    for ch in channel_index:
                        if ch.get('type') == 'mpd' and ch.get('keyId') == kid:
                            ch_name = ch['name']
                            break
                    return json.dumps({"name": ch_name, "url": mpd_url, "type": "mpd", "keyId": kid, "key": k})
            except: continue
        
        return json.dumps({"error": "no CDN responded"})
    
    def serve_hls(self, name):
        html = fetch(f"https://la20hd.com/vivo/canales.php?stream={name}")
        m3u8 = re.search(r'https://[^"<> ]+\.m3u8[^"<> ]*', html)
        if m3u8:
            return json.dumps({"name": name, "url": m3u8.group(0), "type": "m3u8"})
        return json.dumps({"error": "no HLS URL"})

httpd = http.server.HTTPServer(('127.0.0.1', 9999), Handler)
print('API server on port 9999')
sys.stdout.flush()
httpd.serve_forever()
