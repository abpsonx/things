#!/bin/bash

echo "🚀 Starting Deployment for dothings.id..."

# 1. Update system and install Docker if not exists
if ! [ -x "$(command -v docker)" ]; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
fi

if ! [ -x "$(command -v docker-compose)" ]; then
  echo "📦 Installing Docker Compose..."
  apt-get update
  apt-get install -y docker-compose
fi

# 2. Setup Environment
if [ ! -f .env ]; then
  echo "📝 Creating .env from template..."
  cp .env.production .env
  echo "⚠️  PLEASE EDIT .env FILE WITH YOUR SECRETS!"
  exit 1
fi

# 3. Build and Run
echo "🏗️  Building containers..."
docker-compose up -d --build

echo "✅ Deployment finished! System is running at https://dothings.id"
echo "Check logs with: docker-compose logs -f"
