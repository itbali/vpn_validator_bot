vpn_validator_bot/
├── src/
│   ├── __init__.py
│   ├── bot/
│   │   ├── __init__.py
│   │   ├── handlers/
│   │   │   ├── __init__.py
│   │   │   ├── admin.py
│   │   │   ├── user.py
│   │   │   └── support.py
│   │   ├── keyboards.py
│   │   ├── messages.py
│   │   └── utils.py
│   ├── vpn/
│   │   ├── __init__.py
│   │   ├── outline.py
│   │   └── stats.py
│   ├── monitoring/
│   │   ├── __init__.py
│   │   ├── server.py
│   │   ├── metrics.py
│   │   └── alerts.py
│   └── database/
│       ├── __init__.py
│       ├── models.py
│       └── operations.py
├── config/
│   ├── __init__.py
│   ├── settings.py
│   └── logging.py
├── tests/
│   ├── __init__.py
│   ├── test_bot.py
│   ├── test_vpn.py
│   └── test_monitoring.py
├── scripts/
│   ├── backup.sh
│   └── deploy.sh
├── requirements/
│   ├── base.txt
│   ├── dev.txt
│   └── prod.txt
├── main.py
├── README.md
└── .env.example
```

Описание компонентов:

1. **src/bot/** - Логика телеграм бота
   - handlers/ - Обработчики команд и сообщений
   - keyboards.py - Клавиатуры и кнопки
   - messages.py - Текстовые сообщения
   - utils.py - Вспомогательные функции

2. **src/vpn/** - Работа с VPN
   - outline.py - API Outline VPN
   - stats.py - Сбор и анализ статистики

3. **src/monitoring/** - Мониторинг сервера
   - server.py - Проверка состояния сервера
   - metrics.py - Сбор метрик (CPU, RAM, трафик)
   - alerts.py - Система оповещений

4. **src/database/** - Работа с базой данных
   - models.py - Модели данных
   - operations.py - Операции с БД

5. **config/** - Конфигурация
   - settings.py - Настройки приложения
   - logging.py - Настройки логирования

6. **tests/** - Тесты
7. **scripts/** - Скрипты для обслуживания
8. **requirements/** - Зависимости проекта 