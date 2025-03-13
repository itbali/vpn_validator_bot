#!/bin/bash

# Обновление системы
apt update && apt upgrade -y

# Установка Python и необходимых инструментов
apt install -y python3 python3-pip git screen

# Создание директории для бота
mkdir -p /opt/vpn_bot
cd /opt/vpn_bot

# Копирование файлов проекта
cp -r /root/vpn_validator_bot/* .

# Установка зависимостей
pip3 install -r requirements.txt

# Создание systemd сервиса для автозапуска
cat > /etc/systemd/system/vpn_bot.service << EOL
[Unit]
Description=Telegram VPN Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/vpn_bot
ExecStart=/usr/bin/python3 main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOL

# Активация и запуск сервиса
systemctl daemon-reload
systemctl enable vpn_bot
systemctl start vpn_bot

echo "Установка завершена. Бот запущен как системный сервис." 