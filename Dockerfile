FROM nginx:alpine
RUN apk add --no-cache python3
COPY entrypoint.sh /entrypoint.sh
COPY . /usr/share/nginx/html
RUN chmod +x /entrypoint.sh
EXPOSE 80
CMD ["/entrypoint.sh"]
