#!/bin/sh
# Replace __BASE_PATH__ placeholder in index.html with the actual base path
BASE_PATH="${BASE_PATH:-}"
sed -i "s|__BASE_PATH__|${BASE_PATH}|g" /usr/share/nginx/html/index.html

# Substitute API_HOST in nginx config template
API_HOST="${API_HOST:-api}"
envsubst '${API_HOST}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
