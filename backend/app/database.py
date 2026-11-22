from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import DB_URL

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def utcnow() -> datetime:
    return datetime.utcnow()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_setting(db, key: str, default=None):
    from .models import AppSetting
    row = db.get(AppSetting, key)
    return row.value if row else default


def set_setting(db, key: str, value: str):
    from .models import AppSetting
    row = db.get(AppSetting, key)
    if row:
        row.value, row.updated_at = value, utcnow()
    else:
        db.add(AppSetting(key=key, value=value, updated_at=utcnow()))
    db.commit()
