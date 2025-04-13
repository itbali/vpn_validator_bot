#!/bin/bash

# Установка WireGuard
apt-get update
apt-get install -y wireguard

# Генерация ключей сервера
wg genkey | tee /etc/wireguard/private.key
cat /etc/wireguard/private.key | wg pubkey | tee /etc/wireguard/public.key

# Настройка сетевого интерфейса
cat > /etc/wireguard/wg0.conf << EOF
[Interface]
PrivateKey = $(cat /etc/wireguard/private.key)
Address = 10.0.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

EOF

# Включение IP-форвардинга
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p

# Запуск WireGuard
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Установка Node.js и npm
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
apt-get install -y nodejs

# Создание директории для приложения
mkdir -p /opt/vpn_bot
cd /opt/vpn_bot

# Вывод публичного ключа сервера
echo "Server Public Key: $(cat /etc/wireguard/public.key)"
echo "Setup completed successfully!" 