#!/bin/sh
# Refresh tokens at container startup
python3 << 'PYEOF'
import json, re, urllib.request, base64, concurrent.futures, ssl

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def fetch(url, timeout=8):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://la20hd.com/'})
        return urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx).read().decode('utf-8', errors='replace')
    except: return ''

with open('/usr/share/nginx/html/channels/channels.json') as f:
    channels = json.load(f)

def refresh_mpd(ch):
    html = fetch(f"https://bestleague.top/tok.html?get={ch['b64']}")
    if not html: return
    name = base64.b64decode(ch['b64'] + '==').decode('utf-8', errors='replace').rstrip('\x00')
    mt_match = re.search(r'var mt = (\[[\s\S]*?\]);', html)
    if not mt_match: return
    try: mt = json.loads(mt_match.group(1))
    except: return
    if not mt: return
    num = 3
    m = re.search(r'else\s*\n\s*number\s*=\s*(\d+)', html)
    if m: num = int(m.group(1))
    for sel in mt:
        mpd = f"https://{sel['cdn']}.cvattv.com.ar/{sel['token']}/live/c{num}eds/{name}/SA_Live_dash_enc/{name}.mpd"
        try:
            req = urllib.request.Request(mpd, headers={'User-Agent': 'Mozilla/5.0'})
            resp = urllib.request.urlopen(req, timeout=5, context=ssl_ctx)
            if resp.status == 200 and b'<MPD' in resp.read(500):
                ch['url'] = mpd
                print(f'  MPD {ch["name"]}')
                return
        except: continue

def refresh_m3u8(ch):
    html = fetch(f"https://la20hd.com/vivo/canales.php?stream={ch['la20hd']}")
    m3u8 = re.search(r'https://[^"<> ]+\.m3u8[^"<> ]*', html)
    if m3u8:
        ch['url'] = m3u8.group(0)
        print(f'  HLS {ch["name"]}')

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as exe:
    futs = []
    for ch in channels:
        if ch['type'] == 'mpd' and ch.get('b64'):
            futs.append(exe.submit(refresh_mpd, ch))
        elif ch['type'] == 'm3u8' and ch.get('la20hd'):
            futs.append(exe.submit(refresh_m3u8, ch))
    concurrent.futures.wait(futs)

# Remove helper fields before saving
for ch in channels:
    ch.pop('b64', None)
    ch.pop('la20hd', None)

with open('/usr/share/nginx/html/channels/channels.json', 'w') as f:
    json.dump(channels, f, indent=2, ensure_ascii=False)

working = [c for c in channels if c.get('url')]
print(f'\nTotal: {len(working)}/{len(channels)} con URL')
PYEOF

exec nginx -g "daemon off;"
