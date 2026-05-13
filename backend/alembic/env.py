import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import our models and Base
from app.core.database import Base
from app.models import *  # This ensures all models are imported
from app.core.config import get_settings

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the target metadata for autogenerate support
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is also acceptable
    here.  By skipping the Engine creation we don't even need a
    DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    settings = get_settings()
    url = settings.DATABASE_URL
    
    # Smart URL resolver for Host vs Docker
    if "db:5432" in url:
        import socket
        try:
            socket.gethostbyname("db")
        except socket.gaierror:
            url = url.replace("@db:5432", "@localhost:5432")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    settings = get_settings()
    url = settings.DATABASE_URL
    
    # Smart URL resolver for Host vs Docker
    if "db:5432" in url:
        import socket
        try:
            socket.gethostbyname("db")
        except socket.gaierror:
            url = url.replace("@db:5432", "@localhost:5432")
    
    # Try multiple users if one fails (Handle environment mismatch)
    potential_urls = [url]
    if "thingsapp" in url:
        potential_urls.append(url.replace("thingsapp:password_db_mas", "cicleapp:cicleapp_pass"))
    
    last_err = None
    for try_url in potential_urls:
        try:
            configuration = config.get_section(config.config_ini_section, {})
            configuration["sqlalchemy.url"] = try_url
            connectable = async_engine_from_config(
                configuration,
                prefix="sqlalchemy.",
                poolclass=pool.NullPool,
            )
            async with connectable.connect() as connection:
                await connection.run_sync(do_run_migrations)
            await connectable.dispose()
            return # Success!
        except Exception as e:
            last_err = e
            continue
    
    if last_err:
        raise last_err


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
