import os
from dotenv import load_dotenv

load_dotenv()

# Telegram Configuration
BOT_TOKEN = os.getenv('BOT_TOKEN')
CHANNEL_ID = os.getenv('CHANNEL_ID')

# Outline VPN Configuration
OUTLINE_API_URL = os.getenv('OUTLINE_API_URL')
OUTLINE_CERT_SHA256 = os.getenv('OUTLINE_CERT_SHA256') 