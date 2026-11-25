# PrintFlow — Full Production Deployment Guide for cPanel (`printflow.devcenterpoint.com`)

> [← Back to README](README.md)

This guide deploys **PrintFlow** (Laravel 11 API + React/Vite SPA + Windows Print Agent) on standard **cPanel hosting** (Apache or LiteSpeed with PHP 8.2+ and MySQL 8+/MariaDB 10.6+) under a single production domain: **`https://printflow.devcenterpoint.com`**.

## Table of Contents

- [Quick Deployment Reference](#quick-deployment-reference)
- [Architecture on cPanel (Web Root Isolation)](#architecture-on-cpanel-web-root-isolation)
- [Step 1: Configure Domain, SSL, PHP & MySQL in cPanel](#step-1-configure-domain-ssl-php--mysql-in-cpanel)
- [Step 2: Build Frontend Assets & Prepare Backend Files](#step-2-build-frontend-assets--prepare-backend-files)
- [Step 3: Create Production `.htaccess` in Web Root](#step-3-create-production-htaccess-in-web-root)
- [Step 4: Configure Production `.env` & Initialize Database](#step-4-configure-production-env--initialize-database)
- [Step 5: Configure cPanel Cron Jobs (`Outbox`, `Leases` & `Queue`)](#step-5-configure-cpanel-cron-jobs-outbox-leases--queue)
- [Step 6: Onboard Shop, Configure Payment Webhooks & Pair Print Agent](#step-6-onboard-shop-configure-payment-webhooks--pair-print-agent)
- [Step 7: Production Troubleshooting Checklist](#step-7-production-troubleshooting-checklist)

---

## Quick Deployment Reference

| Item | Production Value |
|---|---|
| **Public URL** | `https://printflow.devcenterpoint.com` |
| **Private Laravel Core** | `/home/<CPANEL_USER>/printflow-backend/` |
| **cPanel Document Root** | `/home/<CPANEL_USER>/printflow.devcenterpoint.com/` |
| **Health Probe** | `https://printflow.devcenterpoint.com/api/v1/health` |
| **SSLCOMMERZ IPN URL** | `https://printflow.devcenterpoint.com/api/v1/public/webhooks/sslcommerz` |
| **bKash Webhook URL** | `https://printflow.devcenterpoint.com/api/v1/public/webhooks/bkash` |
| **Windows Agent Endpoint** | `--api https://printflow.devcenterpoint.com` |

---

## Architecture on cPanel (Web Root Isolation)

To keep Laravel's `.env` secrets, database config, and customer print uploads completely outside public HTTP access, split the repository across two sibling folders in `/home/<CPANEL_USER>/`:

```text
/home/<CPANEL_USER>/
├── printflow-backend/                   # PRIVATE: Laravel 11 core (copied from backend/, WITHOUT public/)
│   ├── app/
│   ├── bootstrap/
│   ├── config/
│   ├── database/
│   ├── routes/
│   ├── storage/                         # Uploaded print files, logs, sessions, framework cache
│   ├── vendor/                          # Composer dependencies (--no-dev)
│   └── .env                             # chmod 600 (NEVER inside web root)
│
└── printflow.devcenterpoint.com/        # PUBLIC DOCUMENT ROOT (assigned in cPanel -> Domains)
    ├── .htaccess                        # Unified SPA + Laravel API + Authorization + HTTPS rules
    ├── index.php                        # Modified Laravel entry pointing to ../printflow-backend/
    ├── index.html                       # Built React SPA from frontend/dist/
    ├── assets/                          # Vite JS/CSS chunks from frontend/dist/assets/
    ├── favicon.ico / favicon.svg / ...  # Icons, logo*, dcp-mark.png, site.webmanifest
    └── robots.txt
```

> **How Shared Hosting Drivers Work Automatically**
> PrintFlow detects missing container daemons cleanly when configured for shared cPanel:
> - **Storage (`FILESYSTEM_DISK=local`)**: `UploadController::presign` automatically falls back to authenticated signed-session uploads (`POST /api/v1/public/upload/direct/{file_id}`), saving files inside private `storage/app/documents/` and serving them exclusively to paired counter agents via 60-second HMAC-signed URLs (`/api/v1/agent/jobs/{id}/download`).
> - **Realtime & Queues (`QUEUE_CONNECTION=database`, `CACHE_STORE=database`, `BROADCAST_CONNECTION=log`)**: Atomic bKash token locking uses `cache_locks`, queued tasks run via cPanel Cron `queue:work`, and customer tracking (`/order/{token}`) polls `/api/v1/public/order/{token}` every 3 seconds with zero Node/Reverb WebSocket daemon required.
> - **PDF Inspection & AV**: When `pdfinfo`/`pdftoppm` or `clamd` (`127.0.0.1:3310`) are absent on shared cPanel, `PdfMetricsService` falls back to pure-PHP `/Pages /Count` & `/Encrypt` inspection and `ClamAvScanner` runs EICAR signature validation cleanly. *(On CloudLinux VPS / Dedicated cPanel, installing `poppler-utils`, `clamav`, and Redis enhances thumbnail generation and queue throughput.)*

---

## Step 1: Configure Domain, SSL, PHP & MySQL in cPanel

1. **Create Domain / Subdomain Root** (`cPanel -> Domains -> Create A New Domain`):
   - Domain: `printflow.devcenterpoint.com`
   - Document Root: `/home/<CPANEL_USER>/printflow.devcenterpoint.com`
   - Ensure DNS points an `A` record (`printflow` -> your cPanel server IP) with your registrar or Cloudflare (if using Cloudflare, set SSL/TLS mode to **Full (Strict)**).
2. **Issue HTTPS Certificate** (`cPanel -> SSL/TLS Status`):
   - Select `printflow.devcenterpoint.com` and click **Run AutoSSL**. Wait until Let's Encrypt / Sectigo shows a green lock.
3. **Select PHP Version & Extensions** (`cPanel -> MultiPHP Manager` & `Select PHP Version`):
   - Assign **PHP 8.2** or **PHP 8.3** (8.2+ required by `backend/composer.json`) to `printflow.devcenterpoint.com`.
   - Confirm extensions are active: `pdo_mysql`, `mbstring`, `openssl`, `curl`, `gd`, `fileinfo`, `tokenizer`, `xml`, `ctype`, `zip`, `json`, `bcmath`.
4. **Raise Upload Limits** (`cPanel -> MultiPHP INI Editor` -> select domain `printflow.devcenterpoint.com`):
   - `upload_max_filesize = 100M` (matches PrintFlow's `100 MB` upload cap in `UploadController::presign`)
   - `post_max_size = 105M`
   - `memory_limit = 256M`
   - `max_execution_time = 120`
5. **Create MySQL Database** (`cPanel -> MySQL Databases`):
   - Database name: `<cpanel_user>_printflow`
   - User: `<cpanel_user>_pfuser` (generate a strong password)
   - Click **Add User to Database** and check **ALL PRIVILEGES**.

---

## Step 2: Build Frontend Assets & Prepare Backend Files

Build the React SPA locally (or on a CI runner with Node 20+ and `pnpm`) so low-RAM shared hosting does not run Vite builds on the server:

```bash
cd frontend
pnpm install --frozen-lockfile
VITE_API_URL=https://printflow.devcenterpoint.com/api/v1 pnpm build
```

> `frontend/src/lib/api.ts` defaults to relative `/api/v1`, so building with `VITE_API_URL=https://printflow.devcenterpoint.com/api/v1` (or omitting it under single-domain hosting) routes all API requests directly to `https://printflow.devcenterpoint.com/api/v1/*`.

Next, upload files to cPanel via SSH/SFTP, Git Version Control, or compressed archive (File Manager):

1. Upload everything inside `backend/` **except `backend/public/`** into `/home/<CPANEL_USER>/printflow-backend/`.
2. Upload everything inside **`frontend/dist/`** (`index.html`, `assets/`, `favicon.*`, `logo*.svg`, `dcp-mark.png`, `og-image.png`, `site.webmanifest`, `apple-touch-icon.png`) plus `backend/public/robots.txt` into `/home/<CPANEL_USER>/printflow.devcenterpoint.com/`.
3. Install production PHP dependencies inside `/home/<CPANEL_USER>/printflow-backend` (via **cPanel -> Terminal** or SSH):

```bash
cd /home/<CPANEL_USER>/printflow-backend
composer install --no-dev --optimize-autoloader
```

*(If Composer is unavailable in cPanel terminal, run `composer install --no-dev --optimize-autoloader` locally on a matching PHP 8.2+ environment and upload the generated `vendor/` archive.)*

4. Create `/home/<CPANEL_USER>/printflow.devcenterpoint.com/index.php` pointing into the private backend folder:

```php
<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

if (file_exists($maintenance = __DIR__.'/../printflow-backend/storage/framework/maintenance.php')) {
    require $maintenance;
}

require __DIR__.'/../printflow-backend/vendor/autoload.php';

$app = require_once __DIR__.'/../printflow-backend/bootstrap/app.php';
$app->usePublicPath(__DIR__);
$app->handleRequest(Request::capture());
```

---

## Step 3: Create Production `.htaccess` in Web Root

Create `/home/<CPANEL_USER>/printflow.devcenterpoint.com/.htaccess`:

```apache
<IfModule mod_rewrite.c>
    <IfModule mod_negotiation.c>
        Options -MultiViews -Indexes
    </IfModule>

    DirectoryIndex index.html index.php
    RewriteEngine On

    # Allow AutoSSL / Let's Encrypt HTTP-01 domain validation before forcing HTTPS
    RewriteCond %{HTTPS} !=on
    RewriteCond %{HTTP:X-Forwarded-Proto} !https
    RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

    # Preserve Bearer Authorization headers for Owner Sanctum & Windows Print Agent tokens
    RewriteCond %{HTTP:Authorization} .
    RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]

    # Block direct web access to dotfiles (.env, .git) except .well-known
    RewriteCond %{REQUEST_URI} !^/\.well-known/
    RewriteRule (?:^|/)\. - [F,L]

    # Send API, Sanctum, and Laravel health routes to backend/public entry point
    RewriteRule ^(api|sanctum|up)(/.*)?$ index.php [L,QSA]

    # Serve existing files and folders directly (Vite JS/CSS chunks, SVG/PNG assets)
    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    # Do not rewrite missing static asset chunks to index.html
    RewriteCond %{REQUEST_URI} !^/assets/
    RewriteRule ^ index.html [L]
</IfModule>

<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType image/svg+xml "access plus 1 year"
    ExpiresByType image/png "access plus 1 month"
</IfModule>
```

---

## Step 4: Configure Production `.env` & Initialize Database

Create `/home/<CPANEL_USER>/printflow-backend/.env` with `chmod 600` permissions:

```dotenv
APP_NAME=PrintFlow
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_TIMEZONE=Asia/Dhaka
APP_URL=https://printflow.devcenterpoint.com
FRONTEND_URL=https://printflow.devcenterpoint.com
SANCTUM_STATEFUL_DOMAINS=printflow.devcenterpoint.com

APP_LOCALE=en
APP_FALLBACK_LOCALE=en
APP_FAKER_LOCALE=en_US
APP_EDITION=standalone

APP_CURRENCY=BDT
APP_LOCALE_BD=bn_BD
APP_COUNTRY=BD

LOG_CHANNEL=daily
LOG_LEVEL=warning

# cPanel MySQL Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=<cpanel_user>_printflow
DB_USERNAME=<cpanel_user>_pfuser
DB_PASSWORD=<STRONG_DB_PASSWORD>

# Shared cPanel Database-Backed Drivers (Zero external Redis/Reverb daemon needed)
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=true
SESSION_SECURE_COOKIE=true
BROADCAST_CONNECTION=log
CACHE_STORE=database
CACHE_PREFIX=printflow_cache
QUEUE_CONNECTION=database

# Local Private Disk Storage (uses /api/v1/public/upload/direct fallback + signed downloads)
# Replace with s3 + AWS_* credentials anytime to offload to Cloudflare R2 / AWS S3 / MinIO
FILESYSTEM_DISK=local

# cPanel Domain SMTP Mail
MAIL_MAILER=smtp
MAIL_HOST=mail.devcenterpoint.com
MAIL_PORT=465
MAIL_USERNAME=no-reply@devcenterpoint.com
MAIL_PASSWORD=<SMTP_EMAIL_PASSWORD>
MAIL_ENCRYPTION=ssl
MAIL_FROM_ADDRESS="no-reply@devcenterpoint.com"
MAIL_FROM_NAME="${APP_NAME}"

# Payment Gateways (global defaults; shop-level keys are encrypted AES-256 via /owner/gateways)
SSLCOMMERZ_STORE_ID=
SSLCOMMERZ_STORE_PASSWORD=
SSLCOMMERZ_MODE=live
SSLCOMMERZ_IS_LOCALHOST=false

BKASH_APP_KEY=
BKASH_APP_SECRET=
BKASH_USERNAME=
BKASH_PASSWORD=
BKASH_MODE=live
```

Then initialize permissions, encryption key, database tables, and Laravel caches via cPanel Terminal / SSH:

```bash
cd /home/<CPANEL_USER>/printflow-backend
chmod 600 .env
chmod -R 775 storage bootstrap/cache

php artisan key:generate --force
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

*(Note: verify your cPanel CLI PHP binary version with `php -v`; on CloudLinux / EasyApache use the domain-matched binary if different, e.g. `/usr/local/bin/ea-php83`.)*

---

## Step 5: Configure cPanel Cron Jobs (`Outbox`, `Leases` & `Queue`)

In **cPanel -> Cron Jobs**, register two **Once Per Minute (`* * * * *`)** jobs (replace `<CPANEL_USER>` and PHP path verified via `which php`):

1. **Laravel Scheduler** (dispatches `printflow:process-outbox` every minute and `printflow:reconcile-leases` every 5 minutes as defined in `backend/routes/console.php`):
   ```bash
   /usr/local/bin/php /home/<CPANEL_USER>/printflow-backend/artisan schedule:run >> /dev/null 2>&1
   ```
2. **Prioritized Queue Worker** (processes `payments`, `documents`, `printing`, `notifications`, and `maintenance` jobs cleanly on shared hosting):
   ```bash
   /usr/local/bin/php /home/<CPANEL_USER>/printflow-backend/artisan queue:work database --queue=payments,documents,printing,notifications,maintenance --stop-when-empty --tries=3 --timeout=90 >> /home/<CPANEL_USER>/printflow-backend/storage/logs/queue.log 2>&1
   ```

---

## Step 6: Onboard Shop, Configure Payment Webhooks & Pair Print Agent

1. **Verify Health Endpoint**:
   ```bash
   curl -fsS https://printflow.devcenterpoint.com/api/v1/health
   ```
   Confirm `"status": "healthy"`, `"edition": "standalone"`, `"database.status": "UP"`, and `"disk": "local"` (or `"s3"`).
2. **Register Owner & Shop Profile**:
   - Visit `https://printflow.devcenterpoint.com/register` to create the shop owner account and initialize your shop storefront URL (`https://printflow.devcenterpoint.com/s/<your-slug>`).
   - Print your counter signage QR PDF directly from **`https://printflow.devcenterpoint.com/owner/shop`**.
3. **Configure Payment Gateway Webhooks**:
   - Add live/sandbox merchant credentials under **`https://printflow.devcenterpoint.com/owner/gateways`** (stored encrypted via Laravel `Crypt`).
   - Register these production callback URLs in your merchant portals:
     - **SSLCOMMERZ v4 IPN Listener**: `https://printflow.devcenterpoint.com/api/v1/public/webhooks/sslcommerz`
     - **bKash Callback / Webhook**: `https://printflow.devcenterpoint.com/api/v1/public/webhooks/bkash`
   - *(Always verify checkout and webhook signature handling against sandbox credentials before switching `SSLCOMMERZ_MODE=live` / `BKASH_MODE=live`.)*
4. **Pair the Windows Shop Counter PC**:
   - In **`https://printflow.devcenterpoint.com/owner/printers`**, click **+ Pair New Agent** and copy the 6-digit PIN (5-minute TTL).
   - On the shop counter Windows 10/11 PC inside `print-agent\`:
     ```powershell
     # Python zero-dependency runner
     python run_agent.py --api https://printflow.devcenterpoint.com --pair <6-DIGIT-PIN>

     # Or compiled Rust binary (after cargo build --release)
     .\target\release\print-agent.exe --api https://printflow.devcenterpoint.com --pair <6-DIGIT-PIN>
     ```
   - `agent_config.json` saves `"api_base": "https://printflow.devcenterpoint.com"` and the agent bearer token locally for automatic startup recovery. Pass `--reset` to pair a different shop.

---

## Step 7: Production Troubleshooting Checklist

| Symptom | Root Cause & Resolution |
|---|---|
| `404` on refreshing `/s/<slug>` or `/owner/...` | Confirm `.htaccess` sits directly in `/home/<CPANEL_USER>/printflow.devcenterpoint.com/` and `AllowOverride All` / LiteSpeed rewrite rules are enabled. |
| `401 Unauthenticated` on Owner login or Agent requests | Apache stripped the `Authorization` header; verify `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]` is present in `.htaccess` and re-clear cache if using LiteSpeed Cache. |
| `413 Payload Too Large` on PDF uploads (>10 MB) | Update **cPanel -> MultiPHP INI Editor** (`upload_max_filesize = 100M`, `post_max_size = 105M`) and check host ModSecurity body-size limits. |
| Paid order stays `paid` without reaching `printing` | Verify cPanel Cron Job #1 (`schedule:run`) uses the PHP 8.2+ binary (`which ea-php82` / `which php`) and inspect `storage/logs/laravel.log`. |
| SSL redirect loop (`ERR_TOO_MANY_REDIRECTS`) | If domain traffic passes through Cloudflare proxy, set Cloudflare **SSL/TLS encryption mode** to **Full (Strict)** (not *Flexible*). |
| Updating deployed build later | Run `php artisan config:cache && php artisan route:cache` after `.env` changes; clear old Vite `assets/*` before uploading a fresh `frontend/dist/`. |
