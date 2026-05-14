# 🚀 Comprehensive Deployment Guide - Things/Cicle App

Panduan lengkap untuk deployment production yang aman, scalable, dan reliable.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Docker Configuration](#docker-configuration)
4. [Nginx Configuration](#nginx-configuration)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Database Setup](#database-setup)
7. [Monitoring & Health Checks](#monitoring--health-checks)
8. [Security Hardening](#security-hardening)
9. [Backup Strategy](#backup-strategy)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Server Requirements
- **OS**: Ubuntu 20.04+ or Debian 11+
- **RAM**: Minimum 4GB (8GB recommended)
- **Storage**: 50GB+ SSD
- **CPU**: 2+ cores
- **Network**: Static IP address

### Domain & DNS
- Domain: `dothings.id`
- DNS A record pointing to server IP
- WWW subdomain configured

### SSL Certificate
- Let's Encrypt certificate
- Auto-renewal configured

---

## Server Setup

### 1. Initial Server Configuration

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git vim ufw fail2ban certbot python3-certbot-nginx

# Create deployment user
sudo useradd -m -s /bin/bash things
sudo usermod -aG sudo things

# Setup SSH keys (add your public key)
sudo -u things mkdir -p /home/things/.ssh
sudo -u things chmod 700 /home/things/.ssh
# Add your public key to authorized_keys
sudo -u things touch /home/things/.ssh/authorized_keys
sudo -u things chmod 600 /home/things/.ssh/authorized_keys
```

### 2. Security Setup

```bash
# Configure UFW firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Configure fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Disable password authentication
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

### 3. Docker Installation

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add user to docker group
sudo usermod -aG docker things

# Verify installation
docker --version
docker-compose --version
```

---

## Docker Configuration

### 1. Production Docker Compose (`docker-compose.prod.yml`)

```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: things-db
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    ports:
      - "127.0.0.1:5432:5432"  # Only accessible from localhost
    networks:
      - things-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: things-redis
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - things-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: things-backend
    restart: always
    environment:
      DATABASE_URL: postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: ${SECRET_KEY}
      ENVIRONMENT: production
      FRONTEND_URL: https://dothings.id
      BACKEND_URL: https://dothings.id/api
      REGISTRATION_CODE: ${REGISTRATION_CODE}
    volumes:
      - ./backend/uploads:/app/uploads
      - ./logs:/app/logs
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - things-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: https://dothings.id/api
        NEXT_PUBLIC_SOCKET_URL: https://dothings.id
    container_name: things-frontend
    restart: always
    depends_on:
      - backend
    networks:
      - things-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    container_name: things-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - frontend
      - backend
    networks:
      - things-network
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:

networks:
  things-network:
    driver: bridge
```

### 2. Optimized Dockerfiles

#### Backend Dockerfile (`backend/Dockerfile`)
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create logs directory
RUN mkdir -p /app/logs

# Run as non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

#### Frontend Dockerfile (`frontend/Dockerfile`)
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build arguments
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

# Start application
CMD ["npm", "start"]
```

---

## Nginx Configuration

### Production Nginx Config (`nginx/default.conf`)

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;

# Upstream definitions
upstream backend {
    server things-backend:8000;
    keepalive 32;
}

upstream frontend {
    server things-frontend:3000;
    keepalive 32;
}

# HTTP - Redirect to HTTPS
server {
    listen 80;
    server_name dothings.id www.dothings.id;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    return 301 https://$host$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name dothings.id www.dothings.id;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/dothings.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dothings.id/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Client body size
    client_max_body_size 10M;

    # Logging
    access_log /var/log/nginx/dothings_access.log;
    error_log /var/log/nginx/dothings_error.log;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }

    # Backend API
    location /api {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }

    # WebSockets
    location /socket.io {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Uploaded files
    location /uploads {
        alias /app/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
```

---

## CI/CD Pipeline

### Enhanced GitHub Actions (`.github/workflows/deploy.yml`)

```yaml
name: Production Deployment

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        working-directory: ./backend
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      
      - name: Run backend tests
        working-directory: ./backend
        run: |
          pip install pytest pytest-asyncio
          pytest --tb=short
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install frontend dependencies
        working-directory: ./frontend
        run: npm ci
      
      - name: Build frontend
        working-directory: ./frontend
        run: npm run build
      
      - name: Run frontend tests
        working-directory: ./frontend
        run: npm test -- --passWithNoTests

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy via SSH
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ~/app
            
            # Pull latest changes
            git pull origin main
            
            # Create backup
            docker-compose down
            docker run --rm -v things_postgres_data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/db-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data
            
            # Update environment
            cp .env.production .env
            
            # Build and deploy
            docker-compose -f docker-compose.prod.yml up -d --build
            
            # Run database migrations
            docker-compose -f docker-compose.prod.yml exec -T backend alembic upgrade head
            
            # Cleanup old images
            docker image prune -f
            
            # Health check
            sleep 30
            curl -f http://localhost/api/health || (docker-compose -f docker-compose.prod.yml logs && exit 1)
            
            echo "✅ Deployment successful!"

  notify:
    needs: deploy
    runs-on: ubuntu-latest
    if: always()
    
    steps:
      - name: Notify deployment status
        run: |
          if [ "${{ needs.deploy.result }}" == "success" ]; then
            echo "✅ Deployment to production completed successfully"
          else
            echo "❌ Deployment to production failed"
          fi
```

---

## Database Setup

### 1. Database Initialization Script (`backend/scripts/init_db.py`)

```python
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.models.user import User
from app.core.security import hash_password

async def init_database():
    engine = create_async_engine(
        "postgresql+psycopg://thingsapp:password@localhost:5432/thingsapp",
        echo=True
    )
    
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)
    
    # Create admin user
    async with AsyncSession(engine) as session:
        admin = User(
            email="admin@dothings.id",
            full_name="System Administrator",
            hashed_password=hash_password("change_this_password"),
            is_superuser=True,
            is_active=True
        )
        session.add(admin)
        await session.commit()

if __name__ == "__main__":
    asyncio.run(init_database())
```

### 2. Database Backup Script (`scripts/backup_db.sh`)

```bash
#!/bin/bash

# Database backup script
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d-%H%M%S)
CONTAINER_NAME="things-db"
DB_NAME="thingsapp"
DB_USER="thingsapp"

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Create backup
docker exec $CONTAINER_NAME pg_dump -U $DB_USER $DB_NAME > $BACKUP_DIR/db-backup-$DATE.sql

# Compress backup
gzip $BACKUP_DIR/db-backup-$DATE.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "db-backup-*.sql.gz" -mtime +7 -delete

echo "✅ Database backup completed: $BACKUP_DIR/db-backup-$DATE.sql.gz"
```

---

## Monitoring & Health Checks

### 1. Health Check Endpoint (`backend/app/api/health.py`)

```python
from fastapi import APIRouter
from sqlalchemy import text
from app.core.database import engine
import redis
import json

router = APIRouter()

@router.get("/health")
async def health_check():
    """Comprehensive health check"""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {}
    }
    
    # Check database
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        health_status["services"]["database"] = "healthy"
    except Exception as e:
        health_status["services"]["database"] = f"unhealthy: {str(e)}"
        health_status["status"] = "unhealthy"
    
    # Check Redis
    try:
        r = redis.from_url("redis://redis:6379/0")
        r.ping()
        health_status["services"]["redis"] = "healthy"
    except Exception as e:
        health_status["services"]["redis"] = f"unhealthy: {str(e)}"
        health_status["status"] = "unhealthy"
    
    return health_status

@router.get("/metrics")
async def metrics():
    """Application metrics"""
    return {
        "uptime": time.time() - start_time,
        "memory_usage": psutil.virtual_memory().percent,
        "cpu_usage": psutil.cpu_percent(),
        "active_connections": len(active_connections)
    }
```

### 2. Monitoring Script (`scripts/monitor.sh`)

```bash
#!/bin/bash

# Simple monitoring script
echo "🔍 System Health Check"
echo "======================"

# Check Docker containers
echo "📦 Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check disk usage
echo -e "\n💾 Disk Usage:"
df -h

# Check memory
echo -e "\n🧠 Memory Usage:"
free -h

# Check recent logs
echo -e "\n📋 Recent Errors:"
docker-compose logs --tail=50 | grep -i error

# Check database size
echo -e "\n🗄️ Database Size:"
docker exec things-db psql -U thingsapp -d thingsapp -c "SELECT pg_size_pretty(pg_database_size('thingsapp'));"
```

---

## Security Hardening

### 1. Security Checklist

- [x] SSL/TLS encryption (Let's Encrypt)
- [x] HSTS headers
- [x] Security headers (X-Frame-Options, X-XSS-Protection, etc.)
- [x] Rate limiting
- [x] CORS configuration
- [x] SQL injection protection (SQLAlchemy ORM)
- [x] Password hashing (bcrypt)
- [x] JWT token authentication
- [x] Input validation
- [x] File upload validation
- [x] DDoS protection (Nginx rate limiting)
- [x] Firewall configuration (UFW)
- [x] Fail2ban for SSH protection
- [x] Non-root Docker containers
- [x] Regular security updates

### 2. Environment Variables Security

Create `.env.production` (never commit this file):

```bash
# App
SECRET_KEY=your-super-secret-key-here-change-this
ENVIRONMENT=production

# Database
POSTGRES_USER=thingsapp
POSTGRES_PASSWORD=very-strong-password-here
POSTGRES_DB=thingsapp

# Redis
REDIS_PASSWORD=redis-password-here

# Email
SMTP_HOST=smtp.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-username
SMTP_PASS=your-brevo-password

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Web Push
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# Registration Codes
REGISTRATION_CODE=THINGS-INTERNAL
REGISTRATION_CODE_STAFF=THINGS-STAFF
```

---

## Backup Strategy

### 1. Automated Backup Script (`scripts/automated_backup.sh`)

```bash
#!/bin/bash

# Automated backup script
BACKUP_DIR="/var/backups/things"
DATE=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=30

# Create backup directory
mkdir -p $BACKUP_DIR

echo "🚀 Starting backup process..."

# Database backup
echo "📊 Backing up database..."
docker exec things-db pg_dump -U thingsapp thingsapp > $BACKUP_DIR/db-$DATE.sql
gzip $BACKUP_DIR/db-$DATE.sql

# Uploads backup
echo "📁 Backing up uploads..."
tar -czf $BACKUP_DIR/uploads-$DATE.tar.gz ./backend/uploads/

# Configuration backup
echo "⚙️ Backing up configuration..."
cp docker-compose.prod.yml $BACKUP_DIR/docker-compose-$DATE.yml
cp .env.production $BACKUP_DIR/env-$DATE

# Upload to cloud storage (example with AWS S3)
# aws s3 sync $BACKUP_DIR s3://your-backup-bucket/things/

# Cleanup old backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "env-*" -mtime +$RETENTION_DAYS -delete

echo "✅ Backup completed successfully!"
echo "📦 Backup location: $BACKUP_DIR"
```

### 2. Backup Restoration Script (`scripts/restore_db.sh`)

```bash
#!/bin/bash

# Database restoration script
BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "🔄 Starting database restoration..."

# Stop application
docker-compose down

# Drop existing database
docker run --rm -e PGPASSWORD=password_db_mas postgres:15-alpine \
    psql -h things-db -U thingsapp -d thingsapp -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore database
gunzip -c $BACKUP_FILE | docker exec -i things-db psql -U thingsapp -d thingsapp

# Start application
docker-compose up -d

echo "✅ Database restoration completed!"
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Container Won't Start
```bash
# Check logs
docker-compose logs backend
docker-compose logs frontend

# Check container status
docker-compose ps

# Restart services
docker-compose restart backend
```

#### 2. Database Connection Issues
```bash
# Check if database is running
docker-compose exec db pg_isready

# Test connection
docker-compose exec backend python -c "from app.core.database import engine; print(engine.url)"

# Check database logs
docker-compose logs db
```

#### 3. SSL Certificate Issues
```bash
# Renew SSL certificate
sudo certbot renew --nginx

# Check certificate status
sudo certbot certificates

# Manual renewal
sudo certbot --nginx -d dothings.id -d www.dothings.id
```

#### 4. Performance Issues
```bash
# Check resource usage
docker stats

# Check disk space
df -h

# Check database performance
docker-compose exec db psql -U thingsapp -d thingsapp -c "SELECT * FROM pg_stat_activity;"
```

#### 5. Nginx Issues
```bash
# Test Nginx configuration
docker exec things-nginx nginx -t

# Reload Nginx
docker exec things-nginx nginx -s reload

# Check Nginx logs
docker-compose logs nginx
```

---

## Deployment Commands

### Initial Deployment
```bash
# Clone repository
git clone https://github.com/abpsonx/things.git
cd things

# Setup environment
cp .env.production .env
# Edit .env with your values

# Deploy
chmod +x deploy.sh
./deploy.sh
```

### Update Deployment
```bash
# Pull latest changes
git pull origin main

# Build and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker-compose -f docker-compose.prod.yml exec -T backend alembic upgrade head

# Check health
curl -f http://localhost/api/health
```

### Rollback Deployment
```bash
# Stop current deployment
docker-compose down

# Checkout previous version
git checkout <previous-commit-hash>

# Restore database backup
./scripts/restore_db.sh ./backups/db-backup-YYYYMMDD-HHMMSS.sql.gz

# Start previous version
docker-compose -f docker-compose.prod.yml up -d
```

---

## Maintenance Tasks

### Daily
- [ ] Check application health
- [ ] Review error logs
- [ ] Monitor disk space

### Weekly
- [ ] Update system packages
- [ ] Review security logs
- [ ] Check backup integrity

### Monthly
- [ ] Renew SSL certificates (if needed)
- [ ] Review and optimize database
- [ ] Update Docker images
- [ ] Security audit

---

## Support & Resources

### Documentation
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Docker Documentation](https://docs.docker.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)

### Monitoring Tools
- **Uptime Monitoring**: UptimeRobot, Pingdom
- **Error Tracking**: Sentry, Rollbar
- **Performance**: New Relic, DataDog
- **Logs**: ELK Stack, Graylog

### Security Resources
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [Mozilla SSL Configuration](https://ssl-config.mozilla.org/)

---

*Dibuat pada: 14 Mei 2026*  
*Versi: 1.0.0*  
*Untuk project: Things/Cicle App*