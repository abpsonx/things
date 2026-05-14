# 🚀 Langkah-Langkah Detail Deployment di Server

Panduan step-by-step untuk deploy ke server production (VPS 103.226.138.253).

---

## 📋 **Prerequisites**

Pastikan kamu punya:
- ✅ Akses SSH ke server (`ssh things@103.226.138.253`)
- ✅ Docker & Docker Compose terinstall di server
- ✅ Domain `dothings.id` sudah pointing ke IP server
- ✅ SSL certificate Let's Encrypt sudah ada

---

## 🔧 **Step 1: Upload File ke Server**

### **Option A: Via Git (Recommended)**

```bash
# 1. Di komputer lokal, commit semua perubahan
git add .
git commit -m "feat: stable deployment configuration"
git push origin main

# 2. SSH ke server
ssh things@103.226.138.253

# 3. Di server, masuk ke directory app
cd ~/app

# 4. Pull perubahan terbaru
git pull origin main
```

### **Option B: Via SCP/SFTP**

```bash
# Di komputer lokal, upload file satu per satu:
scp docker-compose.stable.yml things@103.226.138.253:~/app/
scp deploy-stable.sh things@103.226.138.253:~/app/
scp nginx/default.conf things@103.226.138.253:~/app/nginx/
scp backend/Dockerfile things@103.226.138.253:~/app/backend/
scp frontend/Dockerfile things@103.226.138.253:~/app/frontend/

# Lalu SSH ke server
ssh things@103.226.138.253
cd ~/app
```

---

## 🔧 **Step 2: Persiapan di Server**

```bash
# 1. SSH ke server
ssh things@103.226.138.253

# 2. Pindah ke directory app
cd ~/app

# 3. Cek apakah Docker terinstall
docker --version
docker-compose --version

# Jika belum terinstall, jalankan:
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker things
# Logout dan login lagi

# 4. Pastikan .env file ada
ls -la .env

# Jika belum ada, copy dari .env.production
cp .env.production .env
# Edit .env dengan nilai yang sesuai (jika perlu)
nano .env
```

---

## 🔧 **Step 3: Backup Data Existing**

```bash
# 1. Buat directory backup
mkdir -p ~/app/backups

# 2. Backup database yang sedang jalan
docker exec things-db pg_dump -U thingsapp thingsapp > ~/app/backups/pre-stable-deploy-$(date +%Y%m%d-%H%M%S).sql

# 3. Compress backup
gzip ~/app/backups/pre-stable-deploy-*.sql

# 4. Cek backup
ls -lh ~/app/backups/
```

---

## 🔧 **Step 4: Stop Services Lama**

```bash
# 1. Stop semua containers
docker-compose down

# 2. Hapus network lama (jika ada)
docker network rm things_things-network 2>/dev/null || true

# 3. Cek apakah semua containers sudah stop
docker ps
```

---

## 🔧 **Step 5: Build Images Baru**

```bash
# 1. Build semua images dari scratch
docker-compose -f docker-compose.stable.yml build --no-cache

# Ini akan memakan waktu beberapa menit
# Pastikan koneksi internet stabil
```

---

## 🔧 **Step 6: Deploy dengan Script**

```bash
# 1. Beri permission ke script
chmod +x deploy-stable.sh

# 2. Jalankan deployment script
./deploy-stable.sh

# Script akan:
# - Backup database
# - Build images
# - Start services
# - Health checks
# - Rollback jika gagal
```

---

## 🔧 **Step 7: Verifikasi Deployment**

```bash
# 1. Cek status containers
docker-compose -f docker-compose.stable.yml ps

# Harus semua containers dalam status "Up"

# 2. Cek logs
docker-compose -f docker-compose.stable.yml logs -f

# Tekan Ctrl+C untuk keluar

# 3. Test backend health
curl http://localhost/api/health

# Harus return: {"status":"healthy",...}

# 4. Test frontend
curl http://localhost/

# Harus return HTML page

# 5. Test dari browser
# Buka: https://dothings.id
```

---

## 🔧 **Step 8: Monitoring**

```bash
# 1. Cek resource usage
docker stats

# 2. Cek disk space
df -h

# 3. Cek memory
free -h

# 4. Cek logs real-time
docker-compose -f docker-compose.stable.yml logs -f backend
docker-compose -f docker-compose.stable.yml logs -f frontend
docker-compose -f docker-compose.stable.yml logs -f nginx
```

---

## 🔧 **Step 9: Database Migrations**

```bash
# 1. Jalankan migrations
docker-compose -f docker-compose.stable.yml exec -T backend alembic upgrade head

# 2. Cek apakah tables sudah dibuat
docker-compose -f docker-compose.stable.yml exec -T backend python -c "from app.core.database import engine; print(engine.url)"

# 3. Test connection
docker-compose -f docker-compose.stable.yml exec -T backend python -c "import asyncio; from app.core.database import async_session; print('DB OK')"
```

---

## 🔧 **Step 10: Cleanup**

```bash
# 1. Hapus images lama
docker image prune -f

# 2. Hapus containers yang tidak dipakai
docker container prune -f

# 3. Cek disk space lagi
df -h
```

---

## 🚨 **Troubleshooting**

### **Masalah: Containers Restart Terus**

```bash
# Cek logs
docker-compose -f docker-compose.stable.yml logs backend
docker-compose -f docker-compose.stable.yml logs frontend

# Cek resource
docker stats

# Restart services
docker-compose -f docker-compose.stable.yml restart
```

### **Masalah: Database Connection Error**

```bash
# 1. Restart database
docker-compose -f docker-compose.stable.yml restart db

# 2. Tunggu 30 detik
sleep 30

# 3. Test connection
docker exec things-db psql -U thingsapp -d thingsapp -c "SELECT 1;"

# 4. Cek logs database
docker-compose -f docker-compose.stable.yml logs db
```

### **Masalah: Nginx Bad Gateway**

```bash
# 1. Test nginx config
docker exec things-nginx nginx -t

# 2. Reload nginx
docker exec things-nginx nginx -s reload

# 3. Cek apakah backend running
docker-compose -f docker-compose.stable.yml ps backend

# 4. Test backend langsung
docker exec things-backend curl http://localhost:8000/api/health
```

### **Masalah: Frontend Blank/White Screen**

```bash
# 1. Cek logs frontend
docker-compose -f docker-compose.stable.yml logs frontend

# 2. Restart frontend
docker-compose -f docker-compose.stable.yml restart frontend

# 3. Clear browser cache & hard reload (Ctrl+Shift+R)
```

---

## 📊 **Commands Reference**

```bash
# Start services
docker-compose -f docker-compose.stable.yml up -d

# Stop services
docker-compose -f docker-compose.stable.yml down

# Restart services
docker-compose -f docker-compose.stable.yml restart

# View logs
docker-compose -f docker-compose.stable.yml logs -f
docker-compose -f docker-compose.stable.yml logs -f backend
docker-compose -f docker-compose.stable.yml logs -f frontend
docker-compose -f docker-compose.stable.yml logs -f nginx

# Check status
docker-compose -f docker-compose.stable.yml ps

# Check resource
docker stats

# Execute command in container
docker-compose -f docker-compose.stable.yml exec backend bash
docker-compose -f docker-compose.stable.yml exec db psql -U thingsapp -d thingsapp

# Backup database
docker exec things-db pg_dump -U thingsapp thingsapp > backup.sql

# Restore database
gunzip -c backup.sql.gz | docker exec -i things-db psql -U thingsapp -d thingsapp
```

---

## ✅ **Checklist Deployment**

- [ ] SSH ke server berhasil
- [ ] Docker & Docker Compose terinstall
- [ ] File sudah di-upload ke server
- [ ] .env file sudah ada
- [ ] Backup database sudah dibuat
- [ ] Services lama sudah di-stop
- [ ] Images baru sudah di-build
- [ ] Deployment script sudah dijalankan
- [ ] Health checks passed
- [ ] Website bisa diakses (https://dothings.id)
- [ ] Logs tidak ada error
- [ ] Database migrations sudah dijalankan
- [ ] Cleanup sudah dilakukan

---

## 🎉 **Selesai!**

Jika semua langkah di atas berhasil, sistem kamu sekarang running dengan konfigurasi yang stable!

**Next Steps:**
1. Monitor logs selama 24 jam pertama
2. Check performance (response time, resource usage)
3. Setup monitoring tools (Sentry, UptimeRobot, etc.)
4. Plan untuk fitur berikutnya

**Support:**
Jika ada masalah, check:
- `docker-compose -f docker-compose.stable.yml logs -f`
- `docker stats`
- `df -h`

---

*Dibuat: 14 Mei 2026*  
*Server: 103.226.138.253*  
*Domain: dothings.id*