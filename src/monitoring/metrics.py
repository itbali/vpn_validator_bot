import logging
from datetime import datetime, timedelta
import sqlite3
import pandas as pd
import matplotlib.pyplot as plt
import io

logger = logging.getLogger('monitoring.metrics')

class MetricsCollector:
    def __init__(self, db_path='vpn_metrics.db'):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initialize database tables"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Таблица для хранения метрик трафика
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS traffic_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    bytes_transferred INTEGER,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Таблица для хранения метрик сервера
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS server_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cpu_usage REAL,
                    ram_usage REAL,
                    disk_usage REAL,
                    connections INTEGER,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error initializing database: {str(e)}")

    def save_traffic_metric(self, user_id: str, bytes_transferred: int):
        """Save traffic metric to database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute(
                'INSERT INTO traffic_metrics (user_id, bytes_transferred) VALUES (?, ?)',
                (user_id, bytes_transferred)
            )
            
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error saving traffic metric: {str(e)}")

    def save_server_metric(self, cpu_usage: float, ram_usage: float, 
                         disk_usage: float, connections: int):
        """Save server metric to database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute(
                '''INSERT INTO server_metrics 
                   (cpu_usage, ram_usage, disk_usage, connections) 
                   VALUES (?, ?, ?, ?)''',
                (cpu_usage, ram_usage, disk_usage, connections)
            )
            
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error saving server metric: {str(e)}")

    def get_traffic_stats(self, days: int = 7, user_id: str = None):
        """Get traffic statistics for the last N days"""
        try:
            conn = sqlite3.connect(self.db_path)
            
            query = '''
                SELECT 
                    date(timestamp) as date,
                    sum(bytes_transferred) as total_bytes
                FROM traffic_metrics
                WHERE timestamp >= date('now', ?)
            '''
            params = [f'-{days} days']
            
            if user_id:
                query += ' AND user_id = ?'
                params.append(user_id)
            
            query += ' GROUP BY date ORDER BY date'
            
            df = pd.read_sql_query(query, conn, params=params)
            conn.close()
            
            return df
        except Exception as e:
            logger.error(f"Error getting traffic stats: {str(e)}")
            return None

    def get_peak_hours(self, days: int = 7):
        """Get peak hours of VPN usage"""
        try:
            conn = sqlite3.connect(self.db_path)
            
            query = '''
                SELECT 
                    strftime('%H', timestamp) as hour,
                    avg(bytes_transferred) as avg_bytes
                FROM traffic_metrics
                WHERE timestamp >= date('now', ?)
                GROUP BY hour
                ORDER BY avg_bytes DESC
            '''
            
            df = pd.read_sql_query(query, conn, params=[f'-{days} days'])
            conn.close()
            
            return df
        except Exception as e:
            logger.error(f"Error getting peak hours: {str(e)}")
            return None

    def generate_traffic_graph(self, days: int = 7, user_id: str = None):
        """Generate traffic usage graph"""
        try:
            df = self.get_traffic_stats(days, user_id)
            if df is None or df.empty:
                return None
            
            plt.figure(figsize=(10, 6))
            plt.plot(df['date'], df['total_bytes'] / (1024*1024*1024), marker='o')
            plt.title('Использование трафика VPN')
            plt.xlabel('Дата')
            plt.ylabel('Трафик (GB)')
            plt.grid(True)
            plt.xticks(rotation=45)
            
            # Сохраняем график в буфер
            buf = io.BytesIO()
            plt.savefig(buf, format='png', bbox_inches='tight')
            buf.seek(0)
            plt.close()
            
            return buf
        except Exception as e:
            logger.error(f"Error generating traffic graph: {str(e)}")
            return None

    def get_average_usage_time(self, days: int = 7, user_id: str = None):
        """Calculate average VPN usage time"""
        try:
            conn = sqlite3.connect(self.db_path)
            
            query = '''
                WITH sessions AS (
                    SELECT 
                        user_id,
                        timestamp,
                        CASE 
                            WHEN julianday(timestamp) - julianday(lag(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp)) > 0.042 
                            THEN 1 
                            ELSE 0 
                        END as new_session
                    FROM traffic_metrics
                    WHERE timestamp >= date('now', ?)
                    {}
                )
                SELECT 
                    avg(session_length) as avg_length
                FROM (
                    SELECT 
                        user_id,
                        julianday(max(timestamp)) - julianday(min(timestamp)) as session_length
                    FROM (
                        SELECT 
                            user_id,
                            timestamp,
                            sum(new_session) OVER (PARTITION BY user_id ORDER BY timestamp) as session_id
                        FROM sessions
                    )
                    GROUP BY user_id, session_id
                    HAVING session_length > 0
                )
            '''
            
            if user_id:
                query = query.format('AND user_id = ?')
                params = [f'-{days} days', user_id]
            else:
                query = query.format('')
                params = [f'-{days} days']
            
            cursor = conn.cursor()
            cursor.execute(query, params)
            result = cursor.fetchone()
            conn.close()
            
            if result[0]:
                # Конвертируем дни в часы
                return result[0] * 24
            return 0
            
        except Exception as e:
            logger.error(f"Error calculating average usage time: {str(e)}")
            return 0 