# Guía de Despliegue en Producción

**Sistema:** Sistema Integral de Gestión Deportiva de la Liga Cantonal de Quero  
**Organización:** Liga Deportiva Cantonal de Quero, Tungurahua, Ecuador  
**Versión:** 1.0  
**Fecha:** Octubre de 2026

---

## 1. Requisitos del Servidor de Producción

### 1.1 Especificaciones de Hardware Mínimas

- **CPU:** 2 vCPUs (x86_64 o ARM64).
- **RAM:** 4 GB de memoria RAM (mínimo 2 GB dedicados a PostgreSQL y servicios).
- **Disco:** 40 GB SSD (con volumen ampliable para documentos y fotos).
- **Red:** Conexión a internet con IP pública estática y puertos 80 y 443 abiertos.

### 1.2 Software Base

- **Sistema Operativo:** Ubuntu 24.04 LTS (o Debian 12).
- **Docker Engine:** v27.0+ y Docker Compose v2.28+.
- **Node.js:** v22.12.0 LTS (o superior).
- **Nginx:** v1.24+ (o Caddy) como Proxy Inverso con terminación SSL/TLS.
- **Certbot:** Para certificados SSL/TLS gratuitos de Let's Encrypt.

---

## 2. Estructura de Directorios en Servidor

Se recomienda desplegar la aplicación en `/opt/liga-cantonal-quero`:

```text
/opt/liga-cantonal-quero/
├── .env                     # Variables de entorno seguras (permisos 600)
├── docker-compose.yml       # Definición de contenedor PostgreSQL de producción
├── storage/                 # Almacenamiento privado de archivos fuera de la raíz web
├── backups/                 # Respaldos periódicos de la base de datos
├── apps/
│   ├── api/dist/            # Código transpilado de NestJS
│   └── web/dist/            # Artefactos estáticos de React + Vite
└── scripts/                 # Scripts de respaldo y restauración
```

---

## 3. Configuración de Variables de Entorno (`.env`)

Crear `/opt/liga-cantonal-quero/.env` con permisos restringidos (`chmod 600 .env`):

```env
# ─── Base de Datos PostgreSQL ───
POSTGRES_USER=liga_prod_user
POSTGRES_PASSWORD=ClaveUltraSeguraDeAlMenos32Caracteres!
POSTGRES_DB=liga_quero_prod
POSTGRES_PORT=5432
DATABASE_URL=postgresql://liga_prod_user:ClaveUltraSeguraDeAlMenos32Caracteres!@localhost:5432/liga_quero_prod

# ─── Servidor NestJS API ───
NODE_ENV=production
API_PORT=3000
WEB_ORIGIN=https://liga-quero.gob.ec,https://www.liga-quero.gob.ec

# ─── Seguridad y Criptografía ───
# Generar clave de 32 bytes en base64url: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
SECURITY_HASH_KEY=ClaveCriptograficaParaHashesDeIpYPrivacidad32Bytes_
TRUST_PROXY=1
SESSION_IDLE_MINUTES=60
SESSION_ABSOLUTE_HOURS=12
LOGIN_WINDOW_MINUTES=15
LOGIN_MAX_FAILURES_PER_IP=10

# ─── Almacenamiento Seguro de Archivos ───
STORAGE_LOCAL_ROOT=/opt/liga-cantonal-quero/storage
```

---

## 4. Despliegue Paso a Paso

### 4.1 Clonar el Repositorio y Verificar Permisos

```bash
sudo git clone -b main https://github.com/liga-cantonal-quero/sistema.git /opt/liga-cantonal-quero
cd /opt/liga-cantonal-quero
sudo chown -R $USER:$USER /opt/liga-cantonal-quero
mkdir -p storage backups
chmod 700 storage backups
```

### 4.2 Iniciar la Base de Datos

```bash
docker compose up -d db
```

Verificar que PostgreSQL esté activo y saludable:

```bash
docker compose ps
```

### 4.3 Ejecutar Migraciones de Prisma

Aplica todas las migraciones SQL acumuladas sin alterar esquemas existentes:

```bash
npm run db:deploy --workspace=@liga/api
```

### 4.4 Compilar la Aplicación

```bash
npm ci
npm run build
```

### 4.5 Crear el Superadministrador Inicial (CLI)

Si es la primera instalación en una base de datos vacía:

```bash
npm run db:seed --workspace=@liga/api
npm run admin:create-superadmin --workspace=@liga/api
```

El CLI solicitará el correo electrónico, nombre para mostrar y contraseña segura del primer administrador general.

---

## 5. Servicio del Sistema (`Systemd`)

Crear `/etc/systemd/system/liga-api.service`:

```ini
[Unit]
Description=Servicio API NestJS - Liga Cantonal de Quero
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/liga-cantonal-quero/apps/api
EnvironmentFile=/opt/liga-cantonal-quero/.env
ExecStart=/usr/bin/node /opt/liga-cantonal-quero/apps/api/dist/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=liga-api

[Install]
WantedBy=multi-user.target
```

Habilitar e iniciar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable liga-api
sudo systemctl start liga-api
sudo systemctl status liga-api
```

---

## 6. Configuración de Nginx y Certificados SSL

Crear `/etc/nginx/sites-available/liga-quero.conf`:

```nginx
server {
    listen 80;
    server_name liga-quero.gob.ec www.liga-quero.gob.ec;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name liga-quero.gob.ec www.liga-quero.gob.ec;

    ssl_certificate /etc/letsencrypt/live/liga-quero.gob.ec/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/liga-quero.gob.ec/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Encabezados de seguridad
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend estático compilado (SPA)
    root /opt/liga-cantonal-quero/apps/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Backend NestJS
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M; # Límite para subida de fotos y documentos
    }
}
```

Habilitar y reiniciar Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/liga-quero.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Obtener certificado SSL con Certbot:

```bash
sudo certbot --nginx -d liga-quero.gob.ec -d www.liga-quero.gob.ec
```

---

## 7. Verificación del Despliegue

1. **Salud de la API:**
   ```bash
   curl -i https://liga-quero.gob.ec/api/health
   # Debe responder HTTP 200 con: {"status":"ok","service":"liga-api",...}
   ```
2. **Portal Público:**
   Navegar a `https://liga-quero.gob.ec/#/portal` y verificar la visualización de campeonatos en curso, fixtures y clasificaciones.
3. **Acceso Administrativo:**
   Navegar a `https://liga-quero.gob.ec/#/login` e iniciar sesión con las credenciales de superadministrador.
4. **Verificación de Copia de Seguridad:**
   Ejecutar `npm run db:backup` y confirmar la creación del archivo en `backups/`.
