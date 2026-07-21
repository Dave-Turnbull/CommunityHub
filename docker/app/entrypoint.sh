#!/bin/sh
set -e

echo "==> Creating storage directories..."
mkdir -p storage/framework/views \
         storage/framework/cache/data \
         storage/framework/sessions \
         storage/logs \
         bootstrap/cache

# Named volumes mount as root-owned; php-fpm runs as www-data.
# Chown + chmod every boot so the app can always write logs/cache/sessions.
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache
touch storage/logs/laravel.log
chown www-data:www-data storage/logs/laravel.log
chmod 664 storage/logs/laravel.log

if [ ! -f ".env" ]; then
    echo "==> No .env found, copying .env.example..."
    cp .env.example .env
fi

if grep -q "^APP_KEY=$" .env || grep -q "^APP_KEY=\"\"" .env; then
    echo "==> Generating application key..."
    php artisan key:generate --force
fi

echo "==> Discovering packages..."
php artisan package:discover --ansi 2>/dev/null || true

echo "==> Waiting for database..."
attempt=0
until php artisan db:show --json > /dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ $attempt -ge 30 ]; then
        echo "    DB unreachable after 30 tries, skipping migrate."
        break
    fi
    sleep 1
done

if php artisan db:show --json > /dev/null 2>&1; then
    echo "==> Running migrations..."
    php artisan migrate --force 2>/dev/null || true
fi

echo "==> Linking storage..."
php artisan storage:link 2>/dev/null || true

echo "==> Ready."
exec "$@"
