import logging
import os

def setup_logging():
    """Setup logging configuration"""
    log_dir = '/opt/vpn_bot'
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)

    logging.basicConfig(
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        level=logging.DEBUG,
        handlers=[
            logging.FileHandler(f'{log_dir}/bot.log'),
            logging.StreamHandler()
        ]
    )

    # Создаем отдельные логгеры для разных компонентов
    loggers = {
        'bot': logging.getLogger('bot'),
        'vpn': logging.getLogger('vpn'),
        'monitoring': logging.getLogger('monitoring'),
        'database': logging.getLogger('database')
    }

    return loggers 