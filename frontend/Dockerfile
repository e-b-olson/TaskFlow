FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config template
COPY frontend/nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Copy static frontend files
COPY public/ /usr/share/nginx/html/

# Copy entrypoint script
COPY frontend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
