FROM python:3-alpine
WORKDIR /app
COPY . .
EXPOSE 80
CMD ["python3", "server.py"]
