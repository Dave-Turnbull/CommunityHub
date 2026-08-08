# ── Build stage: Composer deps ────────────────────────────────────────────────
FROM php:8.4-cli-alpine AS composer_build

COPY --from=composer:2.7 /usr/bin/composer /usr/bin/composer

RUN apk add --no-cache libpq-dev \
    && docker-php-ext-install pdo_pgsql

WORKDIR /app
COPY composer.json ./

RUN COMPOSER_ALLOW_SUPERUSER=1 composer install \
    --no-dev --no-scripts --no-autoloader \
    --ignore-platform-reqs --prefer-dist

COPY . .

RUN COMPOSER_ALLOW_SUPERUSER=1 composer dump-autoload \
    --optimize --no-dev --no-scripts --ignore-platform-reqs


# ── Build stage: frontend assets ──────────────────────────────────────────────
# Only consumed by compose.yaml's production build (nginx_runtime/app_runtime
# targets, below) — dev's docker-compose.yml builds this Dockerfile's default
# (last) stage, app_runtime, and serves assets from the `vite` dev-server
# container instead, so this stage never runs for a dev `docker compose up`.
FROM node:22-alpine AS node_build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


# ── nginx runtime image (production only) ──────────────────────────────────────
# Bundles the built frontend + public/ into nginx's own image rather than
# relying on a bind mount or a shared volume seeded from app_runtime's image —
# both are racy/stale across redeploys. See compose.yaml.
FROM nginx:1.25-alpine AS nginx_runtime

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=composer_build /app/public /var/www/html/public
COPY --from=node_build /app/public/build /var/www/html/public/build

# Mirrors `php artisan storage:link` (run by app_runtime's entrypoint.sh, in
# app_runtime's own filesystem) so nginx can also resolve /storage/* — the
# app_storage named volume mounts onto storage/app at runtime, only the
# symlink itself needs to pre-exist in this image.
RUN ln -s ../storage/app/public /var/www/html/public/storage

EXPOSE 80


# ── app_runtime image (php-fpm) ─────────────────────────────────────────────────
# Kept last/unnamed-equivalent-default so dev's docker-compose.yml (no
# `target:` set) still builds this stage without changes.
FROM php:8.4-fpm-alpine AS app_runtime

# autoconf/g++/make needed by pecl to compile the Redis extension
RUN apk add --no-cache \
    autoconf g++ make \
    linux-headers libpq-dev libzip-dev \
    libpng-dev libjpeg-turbo-dev freetype-dev \
    icu-dev oniguruma-dev

RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_pgsql pgsql zip gd intl bcmath opcache sockets pcntl \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del autoconf g++ make

COPY docker/app/php.ini       /usr/local/etc/php/conf.d/communityhub.ini
COPY docker/app/php-fpm.conf  /usr/local/etc/php-fpm.d/zz-communityhub.conf
COPY docker/app/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Composer stays in the runtime image (not just the build stage) so
# `docker compose exec app composer ...` works for dev deps — vendor is a
# named volume, built --no-dev at image build time, and there's no local PHP.
COPY --from=composer_build /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY --from=composer_build /app /var/www/html

# Laravel's Vite integration reads public/build/manifest.json server-side
# (to emit the right <script>/<link> tags) even though php-fpm never serves
# the built JS/CSS files themselves — nginx_runtime does that half.
COPY --from=node_build /app/public/build /var/www/html/public/build

RUN mkdir -p storage/framework/cache/data storage/framework/sessions \
             storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["php-fpm"]
