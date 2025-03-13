import os
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

# Настройки Telegram бота
BOT_TOKEN = os.getenv('BOT_TOKEN')
CHANNEL_ID = os.getenv('CHANNEL_ID')
ADMIN_IDS = [int(x) for x in os.getenv('ADMIN_IDS', '').split(',') if x]

# Настройки Outline VPN
OUTLINE_API_URL = os.getenv('OUTLINE_API_URL')
OUTLINE_CERT_SHA256 = os.getenv('OUTLINE_CERT_SHA256')

# Настройки мониторинга
CHECK_MEMBERSHIP_INTERVAL = int(os.getenv('CHECK_MEMBERSHIP_INTERVAL', 3600))  # 1 час
SERVER_CHECK_INTERVAL = int(os.getenv('SERVER_CHECK_INTERVAL', 300))  # 5 минут

# Пороговые значения для мониторинга
CPU_THRESHOLD = float(os.getenv('CPU_THRESHOLD', 80.0))  # 80%
RAM_THRESHOLD = float(os.getenv('RAM_THRESHOLD', 80.0))  # 80%
DISK_THRESHOLD = float(os.getenv('DISK_THRESHOLD', '80.0'))  # 80%
TRAFFIC_THRESHOLD = float(os.getenv('TRAFFIC_THRESHOLD', 1000000000))  # 1GB in bytes

# Настройки базы данных
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///vpn_bot.db') 