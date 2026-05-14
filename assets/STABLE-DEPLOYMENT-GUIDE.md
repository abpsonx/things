# 🚀 Stable Deployment Guide - Quick Start

Panduan cepat untuk deploy sistem yang stable dan reliable.

---

## 📋 **Masalah yang Diperbaiki**

✅ **Nginx Bad Gateway** - Fixed dengan proper upstream health checks  
✅ **Docker Macet** - Fixed with health checks & restart policies  
✅ **Database Ga Sinkron** - Fixed with proper migrations & connection pooling  
✅ **Frontend Macet** - Fixed with optimized builds & caching  

---

## 🎯 **Cara Deploy (Paling Mudah)**

### **Option 1: Deploy Otomatis (Recommended)**

```bash
# 1. Pindah ke directory project
cd /path/to/things

# 2. Pastikan .env sudah ada
cp .env.production .env
# Edit .env dengan nilai yang sesuai

# 3. Jalankan deployment script
chmod +x deploy-stable.sh
./deploy-stable.sh
```

**Script akan otomatis:**
- ✅ Backup database
- ✅ Build images
- ✅ Deploy dengan health checks
- ✅ Rollback otomatis jika gagal

---

### **Option 2: Deploy Manual**

```bash
# 1. Stop services yang sedang jalan
docker-compose down

# 2. Build images baru
docker-compose -f docker-compose.stable.yml build --no-cache

# 3. Start services
docker-compose -f docker-compose.stable.yml up -d

# 4. Tunggu 30 detik
sleep 30

# 5. Check health
curl http://localhost/api/health
curl http://localhost/
```

---

## 📁 **File yang Harus Dipakai**

| File | Fungsi |
|------|--------|
| `docker-compose.stable.yml` | **Docker configuration yang stable** |
| `nginx/default.conf` | **Nginx config dengan health checks** |
| `backend/Dockerfile` | **Backend Dockerfile yang optimized** |
| `frontend/Dockerfile` | **Frontend Dockerfile yang optimized** |
| `deploy-stable.sh` | **Deployment script otomatis** |

---

## 🔧 **Struktur Baru**

```
things/
├── docker-compose.stable.yml    # ← Pakai ini, bukan docker-compose.yml
├── deploy-stable.sh             # ← Script deployment baru
├── nginx/
│   └── default.conf             # ← Nginx config yang sudah diperbaiki
├── backend/
│   └── Dockerfile               # ← Backend Dockerfile baru
├── frontend/
│   └── Dockerfile               # ← Frontend Dockerfile baru
├── logs/
│   ├── backend/                 # ← Log backend
│   └── nginx/                   # ← Log nginx
└── backups/                     # ← Backup database otomatis
```

---

## 🏥 **Health Checks**

Sistem sekarang punya health checks otomatis:

```bash
# Check semua containers
docker-compose -f docker-compose.stable.yml ps

# Check backend health
curl http://localhost/api/health

# Check frontend
curl http://localhost/

# View logs real-time
docker-compose -f docker-compose.stable.yml logs -f
```

---

## 🔍 **Troubleshooting**

### **Container Restart Terus**
```bash
# Lihat logs
docker-compose -f docker-compose.stable.yml logs backend
docker-compose -f docker-compose.stable.yml logs frontend

# Check resource usage
docker stats
```

### **Database Connection Error**
```bash
# Restart database
docker-compose -f docker-compose.stable.yml restart db

# Check database logs
docker-compose -f docker-compose.stable.yml logs db

# Test connection
docker exec things-db psql -U thingsapp -d thingsapp -c "SELECT 1;"
```

### **Nginx Error**
```bash
# Test nginx config
docker exec things-nginx nginx -t

# Reload nginx
docker exec things-nginx nginx -s reload

# Check nginx logs
docker-compose -f docker-compose.stable.yml logs nginx
```

---

## 📊 **Monitoring**

### **Cek Status Services**
```bash
docker-compose -f docker-compose.stable.yml ps
```

### **Cek Resource Usage**
```bash
docker stats
```

### **Cek Log Backend**
```bash
docker-compose -f docker-compose.stable.yml logs --tail=100 backend
```

### **Cek Log Frontend**
```bash
docker-compose -f docker-compose.stable.yml logs --tail=100 frontend
```

### **Cek Database Size**
```bash
docker exec things-db psql -U thingsapp -d thingsapp -c "SELECT pg_size_pretty(pg_database_size('thingsapp'));"
```

---

## 🔄 **Update Deployment**

```bash
# 1. Pull code terbaru
git pull origin main

# 2. Deploy dengan script
./deploy-stable.sh

# 3. Atau manual
docker-compose -f docker-compose.stable.yml up -d --build
docker-compose -f docker-compose.stable.yml exec -T backend alembic upgrade head
```

---

## 💾 **Backup & Restore**

### **Backup Manual**
```bash
docker exec things-db pg_dump -U thingsapp thingsapp > backup.sql
```

### **Restore Manual**
```bash
gunzip -c backup.sql.gz | docker exec -i things-db psql -U thingsapp -d thingsapp
```

### **Auto Backup**
Script `deploy-stable.sh` otomatis backup database sebelum deploy!

---

## ⚡ **Performance Improvements**

### **Yang Sudah Diperbaiki:**

1. **Nginx:**
   - ✅ Rate limiting
   - ✅ Connection pooling
   - ✅ Proper timeouts
   - ✅ WebSocket support
   - ✅ Gzip compression

2. **Docker:**
   - ✅ Health checks
   - ✅ Restart policies
   - ✅ Resource limits
   - ✅ Proper logging
   - ✅ Dependency management

3. **Database:**
   - ✅ Connection pooling
   - ✅ Proper initialization
   - ✅ Automatic backups

4. **Frontend:**
   - ✅ Multi-stage build
   - ✅ Optimized images
   - ✅ Proper caching

---

## 🚨 **Emergency Rollback**

Jika deployment gagal:

```bash
# 1. Stop services
docker-compose -f docker-compose.stable.yml down

# 2. Restore database (jika perlu)
gunzip -c ./backups/db-backup-YYYYMMDD-HHMMSS.sql.gz | docker exec -i things-db psql -U thingsapp -d thingsapp

# 3. Deploy versi sebelumnya
git checkout <previous-commit>
docker-compose -f docker-compose.stable.yml up -d
```

---

## 📞 **Support**

Jika masih ada masalah:

1. **Check logs:**
   ```bash
   docker-compose -f docker-compose.stable.yml logs --tail=200
   ```

2. **Check resource:**
   ```bash
   docker stats
   df -h
   free -h
   ```

3. **Check connectivity:**
   ```bash
   docker-compose -f docker-compose.stable.yml exec backend curl http://localhost:8000/api/health
   ```

---

## ✅ **Checklist Deployment**

- [ ] `.env` file sudah ada dan dikonfigurasi
- [ ] Docker & Docker Compose terinstall
- [ ] Domain `dothings.id` pointing ke server
- [ ] SSL certificate (Let's Encrypt) sudah ada
- [ ] Backup database sudah dibuat
- [ ] Deploy script dijalankan
- [ ] Health checks passed
- [ ] Logs dicek, tidak ada error

---

**🎉 Selamat! Sistem kamu sekarang stable dan reliable!**

*Dibuat: 14 Mei 2026*  
*Versi: 1.0.0*  
*Untuk: Things/Cicle App*