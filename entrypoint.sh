#!/bin/sh
# Refresh all tokens at startup
python3 << 'PYEOF'
import json, re, urllib.request, base64, concurrent.futures, ssl

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def fetch(url, timeout=10):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://la20hd.com/'})
    try:
        return urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx).read().decode('utf-8', errors='replace')
    except: return ''

channels = []

# ============ MPD channels (shaka-player) ============
# Fetch from tok.html, extract MPD URL + DRM keys
mpd_list = [
    ("Canal 4 Uruguay", "Q2FuYWw0X1VSVQ=="),
    ("Canal 10 Uruguay", "Q2FuYWwxMF9VUlU="),
    ("Teledoce", "Q2FuYWwxMlVSVQ=="),
    ("A24", "QW1lcmljYTI0"),
    ("America TV", "QW1lcmljYVRW"),
    ("C5N", "QzVO"),
    ("Cronica TV", "Q3JvbmljYVRW"),
    ("TN", "VG9kb05vdGljaWFz"),
    ("Disney Channel", "RGlzbmV5Q2hhbm5lbEhE"),
    ("HBO", "SEJPSEQ="),
    ("HBO 2", "SEJPXzI="),
    ("HBO Plus", "SEJPX1BsdXM="),
    ("HBO Family", "SEJPX0ZhbWlseQ=="),
    ("HBO Mundi", "SEJPX011bmRp"),
    ("HBO Xtreme", "SEJPX0V4dHJlbWU="),
    ("HBO Pop", "SEJPX1BPUA=="),
    ("HBO Signature", "SEJPX1NpZ25hdHVyZQ=="),
    ("History", "SGlzdG9yeUhE"),
    ("Nat Geo", "TmF0R2VvSEQ="),
    ("Animal Planet", "QW5pbWFsUGxhbmV0"),
    ("Cartoon Network", "Q2FydG9vbk5ldHdvcms="),
    ("MTV", "TVRWX0hE"),
    ("Nick", "Tmlja2Vsb2Rlb24="),
    ("Nick Jr", "Tmlja19Kcg=="),
    ("TNT Series", "VE5UU2VyaWVz"),
    ("TNT Novelas", "VEJT"),
    ("Sony Channel", "U29ueUhE"),
    ("CM", "Q00="),
]

def extract_mpd(name, b64):
    html = fetch(f"https://bestleague.top/tok.html?get={b64}")
    if not html: return
    name_decoded = base64.b64decode(b64 + '==').decode('utf-8', errors='replace').rstrip('\x00')
    mt_match = re.search(r'var mt = (\[[\s\S]*?\]);', html)
    if not mt_match: return
    try: mt = json.loads(mt_match.group(1))
    except: return
    if not mt: return
    
    num = 3
    m = re.search(r'else\s*\n\s*number\s*=\s*(\d+)', html)
    if m: num = int(m.group(1))
    
    # Extract DRM keys
    esc = re.escape(b64.rstrip('='))
    key_m = re.search(rf'getURL\s*==\s*["\'][^"\']*{esc[:10]}[^"\']*["\'].*?keyId\s*=\s*["\']([^"\']+)["\'];?\s*key\s*=\s*["\']([^"\']+)["\']', html, re.DOTALL)
    kid = key_m.group(1) if key_m else ''
    k = key_m.group(2) if key_m else ''
    
    # Try CDNs until one works
    for selected in mt:
        mpd_url = f"https://{selected['cdn']}.cvattv.com.ar/{selected['token']}/live/c{num}eds/{name_decoded}/SA_Live_dash_enc/{name_decoded}.mpd"
        try:
            req = urllib.request.Request(mpd_url, headers={'User-Agent': 'Mozilla/5.0'})
            resp = urllib.request.urlopen(req, timeout=5, context=ssl_ctx)
            if resp.status == 200 and b'<MPD' in resp.read(500):
                channels.append({"name": name, "url": mpd_url, "type": "mpd", "keyId": kid, "key": k})
                print(f'  MPD {name}')
                return
        except: continue

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as exe:
    futs = [exe.submit(extract_mpd, n, b) for n, b in mpd_list]
    concurrent.futures.wait(futs)

# ============ M3U8 channels (hls.js) ============
for name in ['DSports', 'Telefe', 'WinSports']:
    html = fetch(f"https://la20hd.com/vivo/canales.php?stream={name.lower()}")
    m3u8 = re.search(r'https://[^"<> ]+\.m3u8[^"<> ]*', html)
    if m3u8:
        channels.append({"name": name, "url": m3u8.group(0), "type": "m3u8"})
        print(f'  HLS {name}')

with open('/usr/share/nginx/html/channels/channels.json', 'w') as f:
    json.dump(channels, f, indent=2, ensure_ascii=False)

print(f'\nTotal: {len(channels)} canales')
print(f'  MPD: {len([c for c in channels if c["type"]=="mpd"])}')
print(f'  M3U8: {len([c for c in channels if c["type"]=="m3u8"])}')
PYEOF

exec nginx -g "daemon off;"
