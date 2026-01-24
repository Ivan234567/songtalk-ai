FROM node:20-slim

# Устанавливаем Python и системные зависимости для Whisper
# Используем slim образ для уменьшения базового размера
# Объединяем все команды в один RUN для уменьшения размера образа
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3 /usr/bin/python \
    && apt-get clean

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package.json package-lock.json* ./
RUN npm install --production --omit=dev && npm cache clean --force

# Копируем requirements.txt и устанавливаем Python зависимости
# Используем python3 -m pip для гарантии установки в правильный Python
# Устанавливаем только torch и torchaudio (torchvision не нужен для Whisper/TTS)
# Очищаем кэш pip после установки для уменьшения размера
COPY requirements.txt ./
RUN python3 -m pip install --upgrade pip setuptools wheel --no-cache-dir && \
    python3 -m pip install --no-cache-dir numpy>=1.24.0 && \
    python3 -m pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu && \
    python3 -m pip install --no-cache-dir openai-whisper>=20231117 && \
    python3 -m pip install --no-cache-dir TTS>=0.21.0 && \
    python3 -m pip install --no-cache-dir yt-dlp>=2023.12.30 && \
    python3 -c "import whisper; import TTS; print('Dependencies verified')" && \
    python3 -m pip cache purge && \
    rm -rf /root/.cache/pip && \
    echo "Python dependencies installed"

# Копируем скрипт предзагрузки моделей и предзагружаем только нужные модели
# Это гарантирует, что загружаются только small.en (Whisper) и tacotron2-DDC (TTS)
COPY preload_models.py ./
RUN python3 preload_models.py && \
    echo "Required models preloaded: small.en (Whisper) and tacotron2-DDC (TTS)" && \
    rm -f preload_models.py

# Копируем все остальные файлы
COPY . .

RUN npm run build

EXPOSE 8080

# Устанавливаем PYTHON_COMMAND для использования в Node.js
ENV PYTHON_COMMAND=python3

CMD ["npm", "start"]
