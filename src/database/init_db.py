from sqlalchemy import create_engine
from config.settings import DATABASE_URL
from .models import Base

def init_database():
    """Initialize the database"""
    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=engine)

if __name__ == '__main__':
    init_database()
    print("Database initialized successfully") 