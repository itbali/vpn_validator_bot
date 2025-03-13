# VPN Validator Bot

Telegram бот для управления доступом к VPN через Outline VPN.

## Функциональность

- Автоматическая выдача ключей VPN
- Проверка подписки на канал
- Управление ключами (создание, удаление, перевыпуск)
- Административная панель с метриками
- Система поддержки пользователей

## Установка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/alexDiuzhev/vpn_validator_bot.git
cd vpn_validator_bot
```

2. Установите зависимости:
```bash
pip install -r requirements.txt
```

3. Создайте файл `.env` со следующими переменными:
```
BOT_TOKEN=your_telegram_bot_token
CHANNEL_ID=your_channel_id
OUTLINE_API_URL=your_outline_api_url
OUTLINE_CERT_SHA256=your_outline_cert_sha256
```

## Запуск

```bash
python main.py
```

## Команды бота

- `/start` - Получить доступ к VPN
- `/mentor` - Информация о менторе
- `/status` - Проверить статус VPN
- `/regenerate` - Перевыпустить ключ
- `/delete` - Удалить ключ
- `/help` - Помощь по командам
- `/faq` - Частые вопросы
- `/support` - Техническая поддержка
- `/admin` - Панель администратора (только для админов)

## Административные команды

- `/admin_user @username` - Информация о пользователе
- `/admin_delete @username` - Удалить ключ пользователя

## Лицензия

MIT 