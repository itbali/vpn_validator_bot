import psutil
import requests
from datetime import datetime
import logging
from config.settings import (
    OUTLINE_API_URL,
    CPU_THRESHOLD,
    RAM_THRESHOLD,
    TRAFFIC_THRESHOLD,
    DISK_THRESHOLD
)
from src.monitoring.metrics import MetricsCollector

logger = logging.getLogger('monitoring.server')

class ServerMonitor:
    def __init__(self):
        self.last_check = None
        self.alerts = []
        self.metrics_collector = MetricsCollector()

    def check_server_health(self):
        """Check server health metrics"""
        try:
            # Получаем метрики системы
            cpu_percent = psutil.cpu_percent()
            ram_percent = psutil.virtual_memory().percent
            disk_percent = psutil.disk_usage('/').percent
            connections = len(psutil.net_connections())
            
            # Сохраняем метрики
            self.metrics_collector.save_server_metric(
                cpu_usage=cpu_percent,
                ram_usage=ram_percent,
                disk_usage=disk_percent,
                connections=connections
            )
            
            # Проверяем пороговые значения
            alerts = []
            
            if cpu_percent > CPU_THRESHOLD:
                alerts.append(f"⚠️ Высокая загрузка CPU: {cpu_percent}%")
            
            if ram_percent > RAM_THRESHOLD:
                alerts.append(f"⚠️ Высокая загрузка RAM: {ram_percent}%")
            
            if disk_percent > DISK_THRESHOLD:
                alerts.append(f"⚠️ Высокая загрузка диска: {disk_percent}%")
            
            # Проверяем доступность VPN сервера
            if not self._check_vpn_server():
                alerts.append("❌ VPN сервер недоступен!")
            
            self.alerts = alerts
            self.last_check = datetime.now()
            
            return len(alerts) == 0
            
        except Exception as e:
            logger.error(f"Error checking server health: {str(e)}")
            return False

    def _check_vpn_server(self):
        """Check if VPN server is available"""
        try:
            response = requests.get(
                f"{OUTLINE_API_URL}/server",
                verify=False,
                timeout=5
            )
            return response.status_code == 200
        except:
            return False

    def get_system_info(self):
        """Get detailed system information"""
        try:
            return {
                'cpu': {
                    'cores': psutil.cpu_count(),
                    'usage_per_core': psutil.cpu_percent(percpu=True),
                    'total_usage': psutil.cpu_percent()
                },
                'memory': {
                    'total': psutil.virtual_memory().total,
                    'available': psutil.virtual_memory().available,
                    'used': psutil.virtual_memory().used,
                    'percent': psutil.virtual_memory().percent
                },
                'disk': {
                    'total': psutil.disk_usage('/').total,
                    'used': psutil.disk_usage('/').used,
                    'free': psutil.disk_usage('/').free,
                    'percent': psutil.disk_usage('/').percent
                },
                'network': {
                    'interfaces': psutil.net_if_stats(),
                    'connections': len(psutil.net_connections())
                }
            }
        except Exception as e:
            logger.error(f"Error getting system info: {str(e)}")
            return None 