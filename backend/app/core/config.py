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
    # IG Business Login (graph.instagram.com) — pakai App ID dari
    # Instagram API sub-config di Meta Dev Dashboard.
    META_CLIENT_ID: str = ""
    META_CLIENT_SECRET: str = ""
    META_WEBHOOK_VERIFY_TOKEN: str = ""
    # Facebook Login for Business (FBLB, graph.facebook.com) — pakai App
    # ID PARENT dari Meta Dev Dashboard (bukan IG sub-config). Kalau kosong,
    # fallback ke META_CLIENT_ID/SECRET (untuk app yg cuma punya 1 ID).
    META_FB_CLIENT_ID: str = ""
    META_FB_CLIENT_SECRET: str = ""
    # FBLB Configuration ID — dari Meta Dev Dashboard > Facebook Login for
    # Business > Konfigurasi > Create. Wajib di-pass via `config_id` query
    # param di authorize URL.
    META_FB_CONFIG_ID: str = ""

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
