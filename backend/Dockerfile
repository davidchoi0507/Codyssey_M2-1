FROM python:3.12-slim

# ffmpeg: 분석용 압축·숏폼 렌더링 / libsndfile1: soundfile(librosa) 백엔드
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
ENV PYTHONUNBUFFERED=1 NUMBA_CACHE_DIR=/tmp/numba
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
