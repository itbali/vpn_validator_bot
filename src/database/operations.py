from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from typing import Optional, List

from .models import Base, User, VPNKey, UsageStats, UserAction
from config.settings import DATABASE_URL

# Инициализация подключения к базе данных
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def init_db():
    """Инициализация базы данных"""
    Base.metadata.create_all(bind=engine)

def get_db():
    """Получение сессии базы данных"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Операции с пользователями
def create_user(db, telegram_id: int, username: str, full_name: str, is_admin: bool = False) -> User:
    """Создание нового пользователя"""
    user = User(
        telegram_id=telegram_id,
        username=username,
        full_name=full_name,
        is_admin=is_admin
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def get_user(db, telegram_id: int) -> Optional[User]:
    """Получение пользователя по telegram_id"""
    return db.query(User).filter(User.telegram_id == telegram_id).first()

def update_user_activity(db, telegram_id: int):
    """Обновление времени последней активности пользователя"""
    user = get_user(db, telegram_id)
    if user:
        user.last_active = datetime.utcnow()
        db.commit()

# Операции с VPN ключами
def create_vpn_key(db, user_id: int, key_id: str, name: str) -> VPNKey:
    """Создание нового VPN ключа"""
    vpn_key = VPNKey(
        user_id=user_id,
        key_id=key_id,
        name=name
    )
    db.add(vpn_key)
    db.commit()
    db.refresh(vpn_key)
    return vpn_key

def get_vpn_key(db, key_id: str) -> Optional[VPNKey]:
    """Получение VPN ключа по key_id"""
    return db.query(VPNKey).filter(VPNKey.key_id == key_id).first()

def update_vpn_key_usage(db, key_id: str, data_usage: float):
    """Обновление статистики использования VPN ключа"""
    vpn_key = get_vpn_key(db, key_id)
    if vpn_key:
        vpn_key.data_usage = data_usage
        vpn_key.last_active = datetime.utcnow()
        
        # Создаем запись в статистике
        usage_stat = UsageStats(
            vpn_key_id=vpn_key.id,
            data_usage=data_usage
        )
        db.add(usage_stat)
        db.commit()

def deactivate_vpn_key(db, key_id: str):
    """Деактивация VPN ключа"""
    vpn_key = get_vpn_key(db, key_id)
    if vpn_key:
        vpn_key.is_active = False
        db.commit()

# Операции с действиями пользователей
def log_user_action(db, user_id: int, action_type: str, details: str = None):
    """Логирование действий пользователя"""
    action = UserAction(
        user_id=user_id,
        action_type=action_type,
        details=details
    )
    db.add(action)
    db.commit()

# Операции со статистикой
def get_user_stats(db, user_id: int) -> dict:
    """Получение статистики пользователя"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    
    total_usage = 0
    active_keys = 0
    for key in user.vpn_keys:
        if key.is_active:
            total_usage += key.data_usage
            active_keys += 1
    
    return {
        'total_usage': total_usage,
        'active_keys': active_keys,
        'total_keys': len(user.vpn_keys),
        'last_active': user.last_active
    }

def get_server_stats(db) -> dict:
    """Получение общей статистики сервера"""
    total_users = db.query(User).count()
    active_keys = db.query(VPNKey).filter(VPNKey.is_active == True).count()
    total_usage = db.query(VPNKey).filter(VPNKey.is_active == True).with_entities(
        func.sum(VPNKey.data_usage)
    ).scalar() or 0
    
    return {
        'total_users': total_users,
        'active_keys': active_keys,
        'total_usage': total_usage
    } 