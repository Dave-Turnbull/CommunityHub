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


# ── Runtime image ─────────────────────────────────────────────────────────────
FROM php:8.4-fpm-alpine

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

RUN mkdir -p storage/framework/cache/data storage/framework/sessions \
             storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["php-fpm"]
