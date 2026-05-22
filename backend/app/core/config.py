"""Core configuration module."""
from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from pathlib import Path

# Find .env file (project root)
ENV_PATH = Path(__file__).resolve().parent.parent.parent.parent / ".env"


class Settings(BaseSettings):
    # App
    SECRET_KEY: str = "change_me"
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"
    REGISTRATION_CODE: str = "THINGS-2026"
    REGISTRATION_CODE_STAFF: str = "THINGS-STAFF"

    # Database
    DATABASE_URL: str = "postgresql+psycopg://localhost:5432/cicleapp"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Rate Limiting
    RATE_LIMIT_DEFAULT: str = "120/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_UPLOAD: str = "20/minute"

    # Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""

    # Web Push
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_CLAIMS_EMAIL: str = ""

    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Google
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Meta (Instagram / Facebook)
    META_CLIENT_ID: str = ""
    META_CLIENT_SECRET: str = ""

    # TikTok
    TIKTOK_CLIENT_KEY: str = ""
    TIKTOK_CLIENT_SECRET: str = ""

    class Config:
        env_file = str(ENV_PATH)
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
