FROM python:3-alpine
RUN pip install flask
COPY . /app
WORKDIR /app
EXPOSE 80
CMD ["python3", "server.py"]
