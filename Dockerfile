FROM nginx:alpine
RUN apk add --no-cache python3
COPY nginx.conf /etc/nginx/nginx.conf
COPY . /usr/share/nginx/html
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 80
CMD ["/entrypoint.sh"]
