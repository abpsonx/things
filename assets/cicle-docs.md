# 📦 Dokumentasi Stack — Project Management App
> Aplikasi project management berbasis web (PWA) mirip Cicle, dibangun di atas 1 VPS dengan Python sebagai bahasa utama.

---

## 🗂️ Daftar Isi
1. [Tech Stack Overview](#tech-stack-overview)
2. [Arsitektur Sistem](#arsitektur-sistem)
3. [Struktur Folder](#struktur-folder)
4. [Database Schema](#database-schema)
5. [Fitur & Modul](#fitur--modul)
6. [Setup Environment](#setup-environment)
7. [Docker Compose](#docker-compose)
8. [Nginx Config](#nginx-config)
9. [PWA & Push Notification](#pwa--push-notification)
10. [Design System](#design-system)
11. [Estimasi Biaya](#estimasi-biaya)

---

## Tech Stack Overview

### Backend
| Komponen | Teknologi | Keterangan |
|---|---|---|
| Framework | FastAPI | Async, modern, auto Swagger docs |
| Database | PostgreSQL | Database relasional utama |
| DB Migration | Alembic | Schema versioning & auto migration |
| Cache & Queue | Redis | Session, cache, job queue |
| Background Task | Celery | Reminder, kirim email, push notif |
| Real-time | python-socketio | Chat, update kanban live |
| Auth | JWT + RBAC | Role-based access control |
| Rate Limiting | slowapi | Proteksi API dari abuse/DDoS |
| Push Notification | pywebpush | Web Push tanpa Firebase |
| Email | Brevo SMTP | Free 300 email/hari |
| File Storage | Local VPS `/media` | Migrasi ke Cloudflare R2 kalau sudah besar |

### Frontend
| Komponen | Teknologi | Keterangan |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR + routing |
| Styling | Tailwind CSS | Utility-first CSS |
| UI Components | shadcn/ui | Clean, accessible components |
| State Management | Zustand | Ringan, simple |
| Real-time | socket.io-client | Terkoneksi ke backend |
| Kanban | dnd-kit | Drag & drop task |
| Calendar | FullCalendar | Tampilan kalender event |
| Rich Text | TipTap | Editor diskusi & dokumen |
| PWA | next-pwa | Install ke homescreen, push notif |

### Infrastruktur
| Komponen | Teknologi |
|---|---|
| VPS | 2 CPU / 4GB RAM |
| Reverse Proxy | Nginx |
| Container | Docker + Docker Compose |
| SSL | Certbot (Let's Encrypt) |
| Monitoring | UptimeRobot + Netdata |
| Error Tracking | Sentry (free tier) |

---

## Arsitektur Sistem

```
Internet
    │
    ▼
┌─────────────────────────────────┐
│           Nginx (443/80)        │
│  /          → Next.js  :3000    │
│  /api       → FastAPI  :8000    │
│  /socket.io → SocketIO :8001    │
└─────────────────────────────────┘
         │              │
         ▼              ▼
    ┌─────────┐    ┌─────────┐
    │ FastAPI │    │SocketIO │
    └────┬────┘    └────┬────┘
         │              │
         ▼              ▼
    ┌──────────────────────┐
    │      PostgreSQL      │
    └──────────────────────┘
         │
         ▼
    ┌──────────────────────┐
    │        Redis         │
    └──────────────────────┘
         │
         ▼
    ┌──────────────────────┐
    │    Celery Worker     │
    │  (email, push notif) │
    └──────────────────────┘
```

---

## Struktur Folder

```
project-root/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── projects.py
│   │   │   ├── tasks.py
│   │   │   ├── labels.py
│   │   │   ├── comments.py
│   │   │   ├── channels.py
│   │   │   ├── members.py
│   │   │   ├── notifications.py
│   │   │   ├── activity_logs.py
│   │   │   └── files.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── project.py
│   │   │   ├── task.py
│   │   │   ├── label.py
│   │   │   ├── comment.py
│   │   │   ├── channel.py
│   │   │   ├── activity_log.py
│   │   │   └── notification.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   ├── database.py
│   │   │   └── rate_limit.py
│   │   ├── middleware/
│   │   │   └── rate_limiter.py
│   │   ├── tasks/
│   │   │   ├── celery.py
│   │   │   ├── email.py
│   │   │   └── push.py
│   │   ├── sockets/
│   │   │   └── events.py
│   │   └── main.py
│   ├── alembic/
│   │   ├── versions/          ← migration files
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── alembic.ini
│   ├── media/              ← file upload disimpan di sini
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   │   └── [id]/
│   │   │       ├── board/
│   │   │       ├── chat/
│   │   │       ├── calendar/
│   │   │       └── files/
│   │   └── settings/
│   ├── components/
│   │   ├── ui/             ← shadcn components
│   │   ├── board/          ← Kanban components
│   │   ├── chat/           ← Chat components
│   │   └── layout/
│   ├── lib/
│   │   ├── api.ts
│   │   ├── socket.ts
│   │   └── store.ts
│   ├── public/
│   │   ├── manifest.json   ← PWA manifest
│   │   └── icons/
│   ├── next.config.js
│   └── Dockerfile
│
├── nginx/
│   └── default.conf
├── docker-compose.yml
└── .env
```

---

## Database Schema

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Organizations (workspace)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Organization Members
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) CHECK (role IN ('owner', 'manager', 'supervisor', 'member')),
  joined_at TIMESTAMP DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Project Members
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) CHECK (role IN ('manager', 'member')),
  joined_at TIMESTAMP DEFAULT NOW()
);

-- Tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) CHECK (status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
  priority VARCHAR(10) CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  assignee_id UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  due_date TIMESTAMP,
  position INT DEFAULT 0,   -- urutan di kanban
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sub Tasks
CREATE TABLE subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  is_done BOOLEAN DEFAULT FALSE
);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Attachments
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  file_name VARCHAR(255),
  file_path TEXT,
  file_size INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Channels (chat per project)
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Messages (chat)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Events (kalender)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50),   -- task_assigned, comment, deadline, mention
  content TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  ref_id UUID,        -- id task/project/message terkait
  created_at TIMESTAMP DEFAULT NOW()
);

-- Push Subscriptions (Web Push)
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Labels / Tags (per project)
CREATE TABLE labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6b7280',  -- hex color
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Task-Label junction (many-to-many)
CREATE TABLE task_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
  UNIQUE(task_id, label_id)
);

-- Activity Log / Audit Trail
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,     -- 'task_created', 'task_moved', 'member_added', 'comment_added', dll
  entity_type VARCHAR(50) NOT NULL, -- 'task', 'project', 'comment', 'member', dll
  entity_id UUID,                   -- id dari entity terkait
  metadata JSONB,                   -- detail tambahan (old_status, new_status, dll)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Event Attendees (peserta event kalender)
CREATE TABLE event_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) CHECK (status IN ('invited', 'accepted', 'declined')) DEFAULT 'invited',
  UNIQUE(event_id, user_id)
);
```

### Search Indexes (Full-Text Search)

```sql
-- Index untuk pencarian task
CREATE INDEX idx_tasks_search ON tasks
  USING GIN (to_tsvector('indonesian', coalesce(title, '') || ' ' || coalesce(description, '')));

-- Index untuk pencarian message/chat
CREATE INDEX idx_messages_search ON messages
  USING GIN (to_tsvector('indonesian', content));

-- Index untuk pencarian comment
CREATE INDEX idx_comments_search ON comments
  USING GIN (to_tsvector('indonesian', content));

-- Index untuk activity log lookup
CREATE INDEX idx_activity_logs_project ON activity_logs(project_id, created_at DESC);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id, created_at DESC);

-- Index untuk filter task
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
```

---

## Fitur & Modul

### MVP (Prioritas 1)
- [x] Auth — register, login, verifikasi email, reset password
- [x] Workspace / Organisasi
- [x] Manajemen Role (owner, manager, supervisor, member)
- [x] Project — CRUD, invite member
- [x] Task — CRUD, assign, deadline, label, priority
- [x] Kanban Board — drag & drop antar kolom
- [x] Komentar di task
- [x] Notifikasi in-app
- [x] Labels / Tags — warna custom per project, assign ke task
- [x] Activity Log — audit trail semua aksi di project
- [x] Rate Limiting — proteksi API endpoint
- [x] DB Migration — Alembic schema versioning

### Prioritas 2
- [ ] Chat / channel per project
- [ ] Upload file di task
- [ ] Sub-task
- [ ] Kalender & event + attendees (invite peserta)
- [ ] PWA — install ke homescreen
- [ ] Web Push Notification (PC & HP)
- [ ] Full-text Search — cari task, chat, komentar

### Prioritas 3
- [ ] Laporan kinerja
- [ ] Reminder otomatis (Celery)
- [ ] Integrasi Google Calendar
- [ ] Dokumen / wiki per project

---

## Setup Environment

Buat file `.env` di root project:

```env
# App
SECRET_KEY=ganti_dengan_random_string_panjang
ENVIRONMENT=production
FRONTEND_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://user:password@db:5432/appdb

# Redis
REDIS_URL=redis://redis:6379/0

# Rate Limiting
RATE_LIMIT_DEFAULT=60/minute
RATE_LIMIT_AUTH=10/minute
RATE_LIMIT_UPLOAD=20/minute

# Email (Brevo)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_brevo_api_key

# Web Push
VAPID_PUBLIC_KEY=generated_vapid_public_key
VAPID_PRIVATE_KEY=generated_vapid_private_key
VAPID_CLAIMS_EMAIL=your@email.com
```

Generate VAPID key:
```bash
pip install pywebpush
python -c "from py_vapid import Vapid; v = Vapid(); v.generate_keys(); print(v.public_key, v.private_key)"
```

### Alembic Setup (Database Migration)
```bash
# Install
pip install alembic

# Init di folder backend
cd backend
alembic init alembic

# Edit alembic/env.py → set target_metadata = Base.metadata
# Edit alembic.ini → set sqlalchemy.url dari env

# Buat migration baru
alembic revision --autogenerate -m "initial schema"

# Jalankan migration
alembic upgrade head

# Rollback
alembic downgrade -1
```

---

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: appdb
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: always

  backend:
    build: ./backend
    restart: always
    env_file: .env
    ports:
      - "8000:8000"
    volumes:
      - ./backend/media:/app/media
    depends_on:
      - db
      - redis

  celery:
    build: ./backend
    restart: always
    command: celery -A app.tasks.celery worker --loglevel=info
    env_file: .env
    depends_on:
      - db
      - redis

  celery-beat:
    build: ./backend
    restart: always
    command: celery -A app.tasks.celery beat --loglevel=info
    env_file: .env
    depends_on:
      - db
      - redis

  frontend:
    build: ./frontend
    restart: always
    ports:
      - "3000:3000"
    env_file: .env

volumes:
  pgdata:
```

---

## Nginx Config

```nginx
# nginx/default.conf
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Socket.IO
    location /socket.io {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # File uploads
    location /media {
        alias /var/www/media;
        expires 30d;
    }

    client_max_body_size 20M;
}
```

---

## PWA & Push Notification

### manifest.json
```json
{
  "name": "NamaApp",
  "short_name": "NamaApp",
  "description": "Project management untuk tim kamu",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Aktifkan PWA di Next.js
```bash
npm install next-pwa
```

```js
// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
})

module.exports = withPWA({
  // config lainnya
})
```

### Kirim Push Notification (Python)
```python
# app/tasks/push.py
from pywebpush import webpush, WebPushException
import json, os

def send_push(subscription, title, body, url="/"):
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth
                }
            },
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=os.getenv("VAPID_PRIVATE_KEY"),
            vapid_claims={"sub": f"mailto:{os.getenv('VAPID_CLAIMS_EMAIL')}"}
        )
    except WebPushException as e:
        print(f"Push failed: {e}")
```

---

## Design System

Tema: **Clean Monochrome** — putih, hitam, abu-abu.

```css
/* Palet Warna */
--color-bg:        #ffffff;  /* background utama */
--color-surface:   #f9f9f9;  /* card, sidebar */
--color-border:    #e5e5e5;  /* garis pemisah */
--color-text:      #0a0a0a;  /* teks utama */
--color-muted:     #737373;  /* teks sekunder */
--color-accent:    #000000;  /* button primary, highlight */
--color-accent-hover: #1a1a1a;

/* Status Warna (tetap minimal) */
--color-todo:      #e5e5e5;
--color-progress:  #d4d4d4;
--color-done:      #a3a3a3;

--color-high:      #ef4444;  /* priority high */
--color-medium:    #f59e0b;  /* priority medium */
--color-low:       #22c55e;  /* priority low */

/* Typography */
--font-sans: 'Inter', sans-serif;
--radius: 8px;
```

### shadcn/ui Theme Config
```json
{
  "style": "default",
  "baseColor": "neutral",
  "cssVars": true
}
```

---

## Estimasi Biaya

| Item | Biaya |
|---|---|
| VPS (sudah punya) | Rp 0 |
| Domain (.com/tahun) | ~Rp 150.000 – 200.000 |
| SSL (Certbot) | Gratis |
| Email (Brevo free) | Gratis |
| Push Notification (pywebpush) | Gratis |
| File Storage (lokal VPS) | Gratis |
| Monitoring (UptimeRobot) | Gratis |
| **Total tambahan** | **~Rp 150.000 – 200.000/tahun** |

---

## Rate Limiting & Security

### Setup slowapi di FastAPI
```python
# app/core/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

```python
# app/main.py
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.rate_limit import limiter

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

```python
# Contoh penggunaan di endpoint
from app.core.rate_limit import limiter

@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, data: LoginSchema):
    # ...
```

### Rate Limit per Endpoint
| Endpoint | Limit | Keterangan |
|---|---|---|
| `POST /api/auth/login` | 10/menit | Cegah brute-force |
| `POST /api/auth/register` | 5/menit | Cegah spam akun |
| `POST /api/auth/forgot-password` | 3/menit | Cegah email spam |
| `POST /api/*/` (default write) | 60/menit | General protection |
| `GET /api/*/` (default read) | 120/menit | Baca lebih longgar |
| `POST /api/files/upload` | 20/menit | Upload file |

---

## Activity Log Implementation

### Helper Function
```python
# app/services/activity.py
from app.models.activity_log import ActivityLog
from app.core.database import get_db

async def log_activity(
    db,
    org_id: str,
    user_id: str,
    action: str,
    entity_type: str,
    entity_id: str = None,
    project_id: str = None,
    metadata: dict = None
):
    log = ActivityLog(
        org_id=org_id,
        project_id=project_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata or {}
    )
    db.add(log)
    await db.commit()
```

### Contoh Penggunaan
```python
# Di endpoint task
@app.post("/api/tasks")
async def create_task(data: TaskCreate, db = Depends(get_db), user = Depends(get_current_user)):
    task = Task(**data.dict(), created_by=user.id)
    db.add(task)
    await db.commit()

    # Log activity
    await log_activity(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="task_created",
        entity_type="task",
        entity_id=str(task.id),
        project_id=str(task.project_id),
        metadata={"title": task.title, "status": task.status}
    )
    return task
```

### Action Types Reference
| Action | Entity Type | Keterangan |
|---|---|---|
| `task_created` | task | Task baru dibuat |
| `task_updated` | task | Task diupdate (judul, deskripsi) |
| `task_moved` | task | Task pindah kolom kanban |
| `task_assigned` | task | Task di-assign ke member |
| `task_deleted` | task | Task dihapus |
| `comment_added` | comment | Komentar baru di task |
| `member_added` | member | Member ditambah ke project |
| `member_removed` | member | Member dikeluarkan dari project |
| `file_uploaded` | attachment | File di-upload ke task |
| `label_created` | label | Label baru dibuat |
| `project_created` | project | Project baru dibuat |
| `project_updated` | project | Project diupdate |

---

## Full-Text Search

### Search Query Helper
```python
# app/services/search.py
from sqlalchemy import text

async def search_tasks(db, project_id: str, query: str, limit: int = 20):
    sql = text("""
        SELECT id, title, description, status, priority,
               ts_rank(to_tsvector('indonesian', coalesce(title, '') || ' ' || coalesce(description, '')),
                       plainto_tsquery('indonesian', :query)) AS rank
        FROM tasks
        WHERE project_id = :project_id
          AND to_tsvector('indonesian', coalesce(title, '') || ' ' || coalesce(description, ''))
              @@ plainto_tsquery('indonesian', :query)
        ORDER BY rank DESC
        LIMIT :limit
    """)
    result = await db.execute(sql, {"project_id": project_id, "query": query, "limit": limit})
    return result.fetchall()
```

### Search API Endpoint
```python
@app.get("/api/search")
@limiter.limit("30/minute")
async def search(request: Request, q: str, project_id: str, db = Depends(get_db)):
    tasks = await search_tasks(db, project_id, q)
    messages = await search_messages(db, project_id, q)
    return {"tasks": tasks, "messages": messages}
```

---

> 💡 **Catatan:** Dokumentasi ini untuk MVP. Setelah user bertambah, pertimbangkan migrasi file storage ke Cloudflare R2 dan pisahkan service ke VPS terpisah.
