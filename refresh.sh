#!/bin/bash
# Refresh tokens from la20hd and fltvhd
python3 -c "
import json, re, requests, sys

channels = json.load(open('channels/channels.json'))
updated = 0

for ch in channels:
    url = ch['url']
    if 'fubo18.com' in url or 'futbolonlinehd.com' in url:
        # Extract stream name from URL
        m = re.search(r'/([a-zA-Z0-9_-]+)/mono\.m3u8', url)
        if not m:
            m = re.search(r'stream=([a-zA-Z0-9_-]+)', url)
        if m:
            name = m.group(1)
            # Try la20hd
            for domain in ['https://la20hd.com/vivo/canales.php?stream=', 'https://fltvhd.com/online/canal.php?stream=']:
                try:
                    r = requests.get(domain + name, timeout=8, headers={'User-Agent': 'Mozilla/5.0'})
                    m3u8 = re.search(r'https?://[^\"'"'"'<> ]+\.m3u8[^\"<> ]*', r.text)
                    if m3u8:
                        ch['url'] = m3u8.group(0)
                        updated += 1
                        break
                except:
                    pass

with open('channels/channels.json', 'w') as f:
    json.dump(channels, f, indent=2, ensure_ascii=False)

print(f'Refreshed {updated} tokens')
"
