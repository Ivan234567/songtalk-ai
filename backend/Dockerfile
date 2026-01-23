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
COPY requirements.txt ./
RUN pip3 install --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt && \
    python3 -c "import whisper; import TTS; print('Python dependencies installed successfully')"

# Копируем все остальные файлы
COPY . .

RUN npm run build

EXPOSE 8080

# Устанавливаем PYTHON_COMMAND для использования в Node.js
ENV PYTHON_COMMAND=python3

CMD ["npm", "start"]
