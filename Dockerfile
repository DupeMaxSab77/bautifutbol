FROM python:3-alpine
WORKDIR /app
COPY . .
EXPOSE 80
CMD ["python3", "-m", "http.server", "80"]
