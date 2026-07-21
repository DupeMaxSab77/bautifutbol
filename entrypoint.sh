#!/bin/sh
python3 /usr/share/nginx/html/api.py &
sleep 1
exec nginx -g "daemon off;"
