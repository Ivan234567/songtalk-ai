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
    python3 -c "import whisper; from TTS.api import TTS; print('Dependencies verified')" && \
    python3 -m pip cache purge && \
    rm -rf /root/.cache/pip && \
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
    && rm -rf /var/lib/apt/lists/*

# Агрессивная очистка ненужных файлов
RUN rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/* \
    && rm -rf /usr/share/locale/* \
    && rm -rf /var/cache/debconf/* \
    && rm -rf /tmp/* \
    && rm -rf /var/tmp/* \
    && rm -rf /root/.cache/pip \
    && find /usr/local/lib/python3.11/dist-packages -name "*.pyc" -delete \
    && find /usr/local/lib/python3.11/dist-packages -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true \
    && find /usr/local/lib/python3.11/dist-packages/torch -name "test" -type d -exec rm -rf {} + 2>/dev/null || true \
    && find /usr/local/lib/python3.11/dist-packages/torch -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true \
    && find /usr/local/lib/python3.11/dist-packages/torch -name "*.md" -delete 2>/dev/null || true \
    && find /usr/local/lib/python3.11/dist-packages/torch -name "*.txt" -delete 2>/dev/null || true \
    && find /usr/local/lib/python3.11/dist-packages -name "*.md" -delete 2>/dev/null || true \
    && find /usr/local/lib/python3.11/dist-packages -name "*.txt" -delete 2>/dev/null || true \
    && python3 -m pip uninstall -y setuptools wheel 2>/dev/null || true

# Анализ размеров перед копированием кода
RUN echo "=== Размеры компонентов образа ===" && \
    echo "Python пакеты:" && du -sh /usr/local/lib/python3.11/dist-packages/ 2>/dev/null || echo "N/A" && \
    echo "PyTorch:" && du -sh /usr/local/lib/python3.11/dist-packages/torch/ 2>/dev/null || echo "N/A" && \
    echo "TTS:" && du -sh /usr/local/lib/python3.11/dist-packages/TTS/ 2>/dev/null || echo "N/A" && \
    echo "Whisper модель:" && du -sh /root/.cache/whisper/ 2>/dev/null || echo "N/A" && \
    echo "TTS модели:" && du -sh /root/.local/share/tts/ 2>/dev/null || echo "N/A" && \
    echo "Node modules:" && du -sh /app/node_modules/ 2>/dev/null || echo "N/A" && \
    echo "=== Топ-20 самых больших Python пакетов ===" && \
    du -h --max-depth=1 /usr/local/lib/python3.11/dist-packages/ 2>/dev/null | sort -hr | head -20 || echo "N/A" && \
    echo "=== Топ-10 самых больших директорий ===" && \
    du -h --max-depth=1 / 2>/dev/null | sort -hr | head -10 || echo "N/A"

# Копируем все остальные файлы
COPY . .

RUN npm run build

EXPOSE 8080

ENV PYTHON_COMMAND=python3

CMD ["npm", "start"]
