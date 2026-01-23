FROM node:20

# Устанавливаем Python и системные зависимости для Whisper
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Создаем симлинк для python
RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package.json package-lock.json* ./
RUN npm install

# Копируем requirements.txt и устанавливаем Python зависимости
# Используем python3 -m pip для гарантии установки в правильный Python
# Используем --break-system-packages для установки в Docker контейнере
COPY requirements.txt ./
RUN python3 -m pip install --upgrade pip setuptools wheel --break-system-packages && \
    python3 -m pip install --no-cache-dir --break-system-packages numpy>=1.24.0 && \
    python3 -m pip install --no-cache-dir --break-system-packages torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu && \
    python3 -m pip install --no-cache-dir --break-system-packages openai-whisper>=20231117 && \
    python3 -m pip install --no-cache-dir --break-system-packages TTS>=0.21.0 && \
    python3 -m pip install --no-cache-dir --break-system-packages yt-dlp>=2023.12.30 && \
    python3 -c "import whisper; print('Whisper installed successfully')" && \
    python3 -c "import TTS; print('TTS installed successfully')" && \
    python3 -c "import sys; print('Python executable:', sys.executable)" && \
    python3 -c "import whisper; print('Whisper location:', whisper.__file__)" && \
    python3 -c "import TTS; print('TTS location:', TTS.__file__)" && \
    echo "All Python dependencies installed and verified"

# Копируем все остальные файлы
COPY . .

RUN npm run build

EXPOSE 8080

# Устанавливаем PYTHON_COMMAND для использования в Node.js
ENV PYTHON_COMMAND=python3

CMD ["npm", "start"]
