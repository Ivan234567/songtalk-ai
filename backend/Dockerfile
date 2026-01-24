FROM node:20-slim

# Устанавливаем Python, build tools (временно) и системные зависимости
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package.json package-lock.json* ./
RUN npm install --production --omit=dev && npm cache clean --force

# Устанавливаем Python зависимости
COPY requirements.txt ./
RUN python3 -m pip install --upgrade pip setuptools wheel --break-system-packages --no-cache-dir && \
    python3 -m pip install --no-cache-dir --break-system-packages numpy>=1.24.0 && \
    python3 -m pip install --no-cache-dir --break-system-packages torch torchaudio --index-url https://download.pytorch.org/whl/cpu && \
    python3 -m pip install --no-cache-dir --break-system-packages openai-whisper>=20231117 && \
    python3 -m pip install --no-cache-dir --break-system-packages TTS>=0.21.0 && \
    python3 -m pip install --no-cache-dir --break-system-packages yt-dlp>=2023.12.30 && \
    python3 -c "import whisper; import TTS; print('Dependencies verified')" && \
    python3 -m pip cache purge && \
    rm -rf /root/.cache/pip

# Предзагружаем модели
COPY preload_models.py ./
RUN python3 preload_models.py && \
    echo "Whisper model (small.en) preloaded. TTS model will load on first use if needed." && \
    rm -f preload_models.py

# УДАЛЯЕМ build tools для уменьшения размера образа
RUN apt-get remove -y \
    python3-dev \
    build-essential \
    gcc \
    g++ \
    make \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Копируем все остальные файлы
COPY . .

RUN npm run build

EXPOSE 8080

# Устанавливаем PYTHON_COMMAND для использования в Node.js
ENV PYTHON_COMMAND=python3

CMD ["npm", "start"]
