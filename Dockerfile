FROM python:3.12-slim

# Установка необходимых системных пакетов
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Создание рабочей директории
WORKDIR /app

# Копирование файлов зависимостей
COPY requirements.txt .

# Установка зависимостей
RUN pip install --no-cache-dir -r requirements.txt

# Копирование исходного кода
COPY . .

# Создание директории для логов
RUN mkdir -p /opt/vpn_bot && chown -R nobody:nogroup /opt/vpn_bot

# Переключение на непривилегированного пользователя
USER nobody

# Запуск бота
CMD ["python", "-u", "main.py"] 