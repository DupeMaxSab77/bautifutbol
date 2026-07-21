#!/bin/sh
# Refresh streaming tokens at container startup
python3 << 'PYEOF'
import json, re, urllib.request, concurrent.futures, ssl

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        return urllib.request.urlopen(req, timeout=8, context=ssl_ctx).read().decode('utf-8', errors='replace')
    except:
        return ''

with open('/usr/share/nginx/html/channels/channels.json') as f:
    channels = json.load(f)

def refresh(i, ch):
    url = ch['url']
    if 'fubo18.com' in url:
        m = re.search(r'/([a-zA-Z0-9_-]+)/mono\.m3u8', url)
        if m:
            name = m.group(1)
            html = fetch(f"https://la20hd.com/vivo/canales.php?stream={name}")
            m3u8 = re.search(r'https://[^"<> ]+\.m3u8[^"<> ]*', html)
            if m3u8:
                channels[i]['url'] = m3u8.group(0)
                return f'  OK {name}'
    elif 'futbolonlinehd.com' in url:
        m = re.search(r'/([a-zA-Z0-9_-]+)/mono\.m3u8', url)
        if m:
            name = m.group(1)
            html = fetch(f"https://fltvhd.com/online/canal.php?stream={name}")
            m3u8 = re.search(r'https://[^"<> ]+\.m3u8[^"<> ]*', html)
            if m3u8:
                channels[i]['url'] = m3u8.group(0)
                return f'  OK {name}'
    return ''

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as exe:
    fut_map = {exe.submit(refresh, i, ch): i for i, ch in enumerate(channels) if ch['type'] == 'm3u8'}
    for fut in concurrent.futures.as_completed(fut_map):
        r = fut.result()
        if r: print(r)

with open('/usr/share/nginx/html/channels/channels.json', 'w') as f:
    json.dump(channels, f, indent=2, ensure_ascii=False)

print('Done')
PYEOF

exec nginx -g "daemon off;"
