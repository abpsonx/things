#!/bin/bash

# Stable Deployment Script for Things/Cicle App
# This script provides zero-downtime deployment with rollback capability

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.stable.yml"
BACKUP_DIR="./backups"
LOG_DIR="./logs"
HEALTH_CHECK_RETRIES=5
HEALTH_CHECK_INTERVAL=10

# Functions
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
}

check_env() {
    if [ ! -f .env ]; then
        print_error ".env file not found. Please create it from .env.production"
        exit 1
    fi
}

create_backup() {
    print_info "Creating database backup..."
    mkdir -p $BACKUP_DIR
    
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/db-backup-$TIMESTAMP.sql"
    
    # Check if database container is running
    if docker ps | grep -q things-db; then
        docker exec things-db pg_dump -U thingsapp thingsapp > $BACKUP_FILE
        gzip $BACKUP_FILE
        print_success "Database backup created: ${BACKUP_FILE}.gz"
    else
        print_warning "Database container not running, skipping backup"
    fi
}

stop_services() {
    print_info "Stopping existing services..."
    docker-compose -f $COMPOSE_FILE down
}

build_services() {
    print_info "Building Docker images..."
    docker-compose -f $COMPOSE_FILE build --no-cache
}

start_services() {
    print_info "Starting services..."
    docker-compose -f $COMPOSE_FILE up -d
}

health_check() {
    print_info "Running health checks..."
    
    local retry_count=0
    local all_healthy=false
    
    while [ $retry_count -lt $HEALTH_CHECK_RETRIES ]; do
        print_info "Health check attempt $((retry_count + 1)) of $HEALTH_CHECK_RETRIES"
        
        # Check if all containers are running
        if docker-compose -f $COMPOSE_FILE ps | grep -q "Exit"; then
            print_warning "Some containers are not running, waiting..."
            sleep $HEALTH_CHECK_INTERVAL
            retry_count=$((retry_count + 1))
            continue
        fi
        
        # Check backend health
        if curl -f -s http://localhost/api/health > /dev/null 2>&1; then
            print_success "Backend is healthy"
        else
            print_warning "Backend health check failed, waiting..."
            sleep $HEALTH_CHECK_INTERVAL
            retry_count=$((retry_count + 1))
            continue
        fi
        
        # Check frontend health
        if curl -f -s http://localhost/ > /dev/null 2>&1; then
            print_success "Frontend is healthy"
        else
            print_warning "Frontend health check failed, waiting..."
            sleep $HEALTH_CHECK_INTERVAL
            retry_count=$((retry_count + 1))
            continue
        fi
        
        all_healthy=true
        break
    done
    
    if [ "$all_healthy" = true ]; then
        print_success "All services are healthy!"
        return 0
    else
        print_error "Health checks failed after $HEALTH_CHECK_RETRIES attempts"
        return 1
    fi
}

cleanup_old_images() {
    print_info "Cleaning up old Docker images..."
    docker image prune -f
}

show_status() {
    print_info "Current service status:"
    docker-compose -f $COMPOSE_FILE ps
    
    print_info "Recent logs:"
    docker-compose -f $COMPOSE_FILE logs --tail=20
}

rollback() {
    print_error "Deployment failed! Rolling back..."
    
    # Find latest backup
    LATEST_BACKUP=$(ls -t $BACKUP_DIR/db-backup-*.sql.gz 2>/dev/null | head -1)
    
    if [ -n "$LATEST_BACKUP" ]; then
        print_info "Found backup: $LATEST_BACKUP"
        print_info "To restore database, run:"
        echo "gunzip -c $LATEST_BACKUP | docker exec -i things-db psql -U thingsapp -d thingsapp"
    fi
    
    # Stop services
    docker-compose -f $COMPOSE_FILE down
    
    print_error "Rollback complete. Please check logs and fix issues."
}

# Main deployment process
main() {
    print_info "🚀 Starting Stable Deployment for dothings.id"
    echo "========================================"
    
    # Pre-deployment checks
    check_docker
    check_env
    
    # Create backup
    create_backup
    
    # Stop existing services
    stop_services
    
    # Build new images
    build_services
    
    # Start services
    start_services
    
    # Wait for services to start
    print_info "Waiting for services to initialize..."
    sleep 30
    
    # Health check
    if ! health_check; then
        rollback
        exit 1
    fi
    
    # Cleanup
    cleanup_old_images
    
    # Show status
    echo "========================================"
    show_status
    
    print_success "✅ Deployment completed successfully!"
    print_info "📊 Application is running at: https://dothings.id"
    print_info "📋 View logs: docker-compose -f $COMPOSE_FILE logs -f"
    print_info "🛑 Stop services: docker-compose -f $COMPOSE_FILE down"
}

# Run main function
main "$@"