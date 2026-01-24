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
    # Проверяем импорт БЕЗ загрузки моделей (чтобы избежать автоматической загрузки)
    python3 -c "import whisper; from TTS.api import TTS; print('Dependencies verified')" && \
    python3 -m pip cache purge && \
    rm -rf /root/.cache/pip && \
    # Удаляем все модели, которые могли загрузиться автоматически при установке TTS
    rm -rf /root/.cache/whisper/* && \
    rm -rf /root/.cache/tts/* && \
    rm -rf /root/.cache/huggingface/* && \
    rm -rf /root/.local/share/tts/* && \
    rm -rf /root/.local/share/coqui/* && \
    echo "All auto-downloaded models removed"

# Предзагружаем модели
COPY preload_models.py ./
RUN python3 preload_models.py && \
    echo "Whisper model (small.en) preloaded. TTS model will load on first use if needed." && \
    rm -f preload_models.py

# УДАЛЯЕМ build tools и ненужные пакеты для уменьшения размера образа
RUN apt-get remove -y \
    python3-dev \
    build-essential \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/* \
    && rm -rf /usr/share/locale/* \
    && rm -rf /var/cache/debconf/* \
    && rm -rf /tmp/* \
    && rm -rf /var/tmp/*

# Удаляем setuptools и wheel после установки всех пакетов (они больше не нужны)
# pip оставляем на случай, если понадобится установить что-то в runtime
RUN python3 -m pip uninstall -y setuptools wheel || true

# Копируем все остальные файлы
COPY . .

RUN npm run build

EXPOSE 8080

# Устанавливаем PYTHON_COMMAND для использования в Node.js
ENV PYTHON_COMMAND=python3

CMD ["npm", "start"]
