FROM --platform=$TARGETPLATFORM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CHROME_PATH=/usr/bin/chromium

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN adduser --system --group --home /app appuser \
    && mkdir -p generated-pdfs assets/custom-products runtime-data/user-products runtime-data/user-quotes runtime-data/user-quote-history \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 4173

CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "4173"]
