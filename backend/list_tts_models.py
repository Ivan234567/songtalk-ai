#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для вывода списка установленных Coqui TTS моделей и их характеристик
"""

import sys
import os
from pathlib import Path

# Set UTF-8 encoding for stdout/stderr (important for Windows)
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    from TTS.api import TTS
    import torch
except ImportError as e:
    print(f"ОШИБКА: Библиотека TTS не установлена: {str(e)}")
    print("Установите: pip install TTS")
    sys.exit(1)

def get_model_info(model_name):
    """Получить информацию о модели"""
    try:
        # Пытаемся загрузить модель для получения информации
        device = "cuda" if torch.cuda.is_available() else "cpu"
        tts = TTS(model_name=model_name, progress_bar=False).to(device)
        
        info = {
            "name": model_name,
            "device": device,
            "loaded": True,
            "type": type(tts).__name__ if hasattr(tts, '__class__') else "Unknown"
        }
        
        # Попытаемся получить дополнительную информацию
        if hasattr(tts, 'model'):
            info["model_class"] = type(tts.model).__name__ if hasattr(tts.model, '__class__') else "Unknown"
        if hasattr(tts, 'vocoder'):
            info["vocoder"] = type(tts.vocoder).__name__ if hasattr(tts.vocoder, '__class__') else "Unknown"
        
        return info
    except Exception as e:
        return {
            "name": model_name,
            "loaded": False,
            "error": str(e)
        }

def main():
    print("=" * 80)
    print("COQUI TTS - УСТАНОВЛЕННЫЕ МОДЕЛИ")
    print("=" * 80)
    print()
    
    # Проверка TTS_HOME
    if 'TTS_HOME' in os.environ:
        tts_home = os.environ['TTS_HOME']
        print(f"TTS_HOME: {tts_home}")
    else:
        # Стандартное расположение для Windows
        home = Path.home()
        tts_home = home / "AppData" / "Local" / "tts"
        print(f"TTS_HOME (по умолчанию): {tts_home}")
    
    print(f"Устройство: {'CUDA (GPU)' if torch.cuda.is_available() else 'CPU'}")
    print()
    
    # Получить список всех доступных моделей
    print("Получение списка моделей...")
    try:
        api = TTS()
        all_models = api.list_models()
        
        print(f"\nВсего доступно моделей: {len(all_models)}")
        print()
        
        # Проверить модели, которые используются в коде
        used_models = [
            "tts_models/en/ljspeech/tacotron2-DDC",
            "tts_models/en/ljspeech/vits"
        ]
        
        print("=" * 80)
        print("МОДЕЛИ, ИСПОЛЬЗУЕМЫЕ В ПРОЕКТЕ:")
        print("=" * 80)
        print()
        
        for model_name in used_models:
            if model_name in all_models:
                print(f"✓ {model_name}")
                print(f"  Статус: Доступна")
                print(f"  Путь к модели: {tts_home}")
                print()
            else:
                print(f"✗ {model_name}")
                print(f"  Статус: Не найдена (будет загружена при первом использовании)")
                print()
        
        print("=" * 80)
        print("ВСЕ ДОСТУПНЫЕ МОДЕЛИ:")
        print("=" * 80)
        print()
        
        # Группировать модели по типам
        model_groups = {
            "Английские модели (en)": [],
            "Мультиязычные модели (multilingual)": [],
            "Модели других языков": [],
            "Вокодеры (vocoder)": [],
            "Конвертация голоса (voice_conversion)": [],
            "Другие": []
        }
        
        for model_name in sorted(all_models):
            if "/en/" in model_name or model_name.startswith("tts_models/en"):
                model_groups["Английские модели (en)"].append(model_name)
            elif "/multilingual/" in model_name or "multilingual" in model_name:
                model_groups["Мультиязычные модели (multilingual)"].append(model_name)
            elif "/vocoder" in model_name or "vocoder" in model_name:
                model_groups["Вокодеры (vocoder)"].append(model_name)
            elif "voice_conversion" in model_name:
                model_groups["Конвертация голоса (voice_conversion)"].append(model_name)
            elif "/" in model_name and not model_name.startswith("tts_models/en"):
                model_groups["Модели других языков"].append(model_name)
            else:
                model_groups["Другие"].append(model_name)
        
        # Вывести сгруппированные модели
        for group_name, models in model_groups.items():
            if models:
                print(f"\n{group_name} ({len(models)}):")
                print("-" * 80)
                for model in models:
                    # Отметить используемые модели
                    marker = " ⭐" if model in used_models else ""
                    print(f"  • {model}{marker}")
        
        print()
        print("=" * 80)
        print("ХАРАКТЕРИСТИКИ ИСПОЛЬЗУЕМЫХ МОДЕЛЕЙ:")
        print("=" * 80)
        print()
        
        for model_name in used_models:
            if model_name in all_models:
                print(f"\n{model_name}:")
                print("-" * 80)
                
                # Парсинг названия модели
                parts = model_name.split("/")
                if len(parts) >= 4:
                    lang = parts[1]
                    dataset = parts[2]
                    model_type = parts[3]
                    
                    print(f"  Язык: {lang.upper()}")
                    print(f"  Датасет: {dataset}")
                    print(f"  Тип модели: {model_type}")
                    
                    # Описание типов моделей
                    model_descriptions = {
                        "tacotron2-DDC": "Tacotron2 с Double Decoder Consistency - быстрая и качественная модель",
                        "vits": "VITS (Variational Inference with adversarial learning for end-to-end Text-to-Speech) - высококачественная end-to-end модель",
                        "tacotron2-DCA": "Tacotron2 с Dynamic Convolution Attention",
                        "glow-tts": "Glow-TTS - быстрая модель без attention механизма",
                        "speedy-speech": "SpeedySpeech - очень быстрая модель"
                    }
                    
                    if model_type in model_descriptions:
                        print(f"  Описание: {model_descriptions[model_type]}")
                
                # Попытаться загрузить и получить больше информации
                try:
                    info = get_model_info(model_name)
                    if info.get("loaded"):
                        print(f"  Статус загрузки: ✓ Загружена успешно")
                        print(f"  Устройство: {info.get('device', 'Unknown')}")
                        if "model_class" in info:
                            print(f"  Класс модели: {info['model_class']}")
                        if "vocoder" in info:
                            print(f"  Вокодер: {info['vocoder']}")
                    else:
                        print(f"  Статус загрузки: ✗ Ошибка: {info.get('error', 'Unknown')}")
                except Exception as e:
                    print(f"  Статус загрузки: Не удалось загрузить: {str(e)}")
                
                print()
        
        # Проверить физически установленные модели в TTS_HOME
        if os.path.exists(tts_home):
            print("=" * 80)
            print("ФИЗИЧЕСКИ УСТАНОВЛЕННЫЕ МОДЕЛИ (на диске):")
            print("=" * 80)
            print(f"Директория: {tts_home}")
            print()
            
            if os.path.isdir(tts_home):
                for root, dirs, files in os.walk(tts_home):
                    level = root.replace(str(tts_home), '').count(os.sep)
                    indent = ' ' * 2 * level
                    subdir = os.path.basename(root)
                    if subdir and not subdir.startswith('.'):
                        print(f"{indent}{subdir}/")
                        if level == 0:  # Только первый уровень
                            break
        
    except Exception as e:
        print(f"ОШИБКА при получении списка моделей: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
