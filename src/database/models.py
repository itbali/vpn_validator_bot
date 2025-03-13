from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    telegram_id = Column(Integer, unique=True)
    username = Column(String)
    full_name = Column(String)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime)
    
    vpn_keys = relationship("VPNKey", back_populates="user")
    actions = relationship("UserAction", back_populates="user")

class VPNKey(Base):
    __tablename__ = 'vpn_keys'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    key_id = Column(String, unique=True)
    name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime)
    data_usage = Column(Float, default=0.0)  # в байтах
    is_active = Column(Boolean, default=True)
    
    user = relationship("User", back_populates="vpn_keys")
    usage_stats = relationship("UsageStats", back_populates="vpn_key")

class UsageStats(Base):
    __tablename__ = 'usage_stats'
    
    id = Column(Integer, primary_key=True)
    vpn_key_id = Column(Integer, ForeignKey('vpn_keys.id'))
    timestamp = Column(DateTime, default=datetime.utcnow)
    data_usage = Column(Float)  # в байтах
    
    vpn_key = relationship("VPNKey", back_populates="usage_stats")

class UserAction(Base):
    __tablename__ = 'user_actions'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    action_type = Column(String)  # например: 'create_key', 'delete_key', 'regenerate_key'
    timestamp = Column(DateTime, default=datetime.utcnow)
    details = Column(String)  # дополнительная информация о действии
    
    user = relationship("User", back_populates="actions") 