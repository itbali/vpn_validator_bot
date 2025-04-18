# VPN Bot

Telegram бот для управления VPN доступом с поддержкой множественных серверов Outline VPN.

## Возможности

- Поддержка множественных VPN серверов
- Автоматическая выдача и управление ключами
- Мониторинг использования трафика
- Интеграция с платными и бесплатными Telegram каналами
- Административный интерфейс для управления серверами

## Установка

1. Клонируйте репозиторий:

```bash
git clone https://github.com/yourusername/vpn_bot_node.git
cd vpn_bot_node
```

2. Создайте файл .env на основе .env.example:

```bash
cp .env.example .env
```

3. Настройте переменные окружения в файле .env

4. Запустите бота с помощью Docker Compose:

```bash
docker-compose up -d
```

## Настройка VPN серверов

1. Установите Outline Manager на свой компьютер
2. Создайте новый сервер Outline VPN
3. В Outline Manager найдите API URL и сертификат (Настройки -> Управление через API)
4. Используйте команду `/addserver` в боте для добавления сервера:

```
/addserver <name> <location> <api_url> <cert_sha256>
```

Пример:

```
/addserver Netherlands-1 Amsterdam https://outline-server:port/api cert_sha256_hash
```

## Команды администратора

- `/addserver` - Добавить новый VPN сервер
- `/removeserver` - Удалить VPN сервер
- `/listservers` - Показать список всех серверов

## Команды пользователя

- 🔑 Получить ключ - Создать новый VPN ключ
- 📊 Статистика - Показать статистику использования
- 🔄 Обновить ключ - Перевыпустить VPN ключ
- 🗑 Удалить ключ - Удалить текущий VPN ключ

## Разработка

1. Установите зависимости:

```bash
npm install
```

2. Запустите базу данных:

```bash
docker-compose up db -d
```

3. Запустите бота в режиме разработки:

```bash
npm run dev
```

## Лицензия

MIT
