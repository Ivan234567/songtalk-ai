#!/bin/bash
# Скрипт для анализа размера Docker образа

echo "=== Анализ размера Docker образа ==="
echo ""

echo "1. Размер базового образа node:20-slim:"
docker images node:20-slim --format "{{.Size}}"
echo ""

echo "2. Размер установленных Python пакетов:"
du -sh /usr/local/lib/python3.11/dist-packages/ 2>/dev/null || echo "Не доступно в контексте"
echo ""

echo "3. Размер PyTorch:"
du -sh /usr/local/lib/python3.11/dist-packages/torch/ 2>/dev/null || echo "Не доступно в контексте"
echo ""

echo "4. Размер TTS:"
du -sh /usr/local/lib/python3.11/dist-packages/TTS/ 2>/dev/null || echo "Не доступно в контексте"
echo ""

echo "5. Размер моделей:"
du -sh /root/.cache/whisper/ 2>/dev/null || echo "Не доступно в контексте"
du -sh /root/.local/share/tts/ 2>/dev/null || echo "Не доступно в контексте"
echo ""

echo "6. Топ-10 самых больших директорий:"
du -h --max-depth=1 / 2>/dev/null | sort -hr | head -10 || echo "Не доступно в контексте"
echo ""

echo "7. Размер всех установленных пакетов Python:"
find /usr/local/lib/python3.11/dist-packages -type d -name "*.dist-info" -exec du -sh {} \; 2>/dev/null | sort -hr | head -20 || echo "Не доступно в контексте"
