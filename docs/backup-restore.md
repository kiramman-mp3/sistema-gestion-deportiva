# Procedimiento de Copias de Seguridad y Restauración

**Organización:** Liga Deportiva Cantonal de Quero, Tungurahua, Ecuador  
**Sistema:** Sistema Integral de Gestión Deportiva  
**Versión:** 1.0  
**Fecha:** Octubre de 2026

---

## 1. Propósito y Alcance

Este documento describe la política, herramientas, scripts y procedimientos operativos para generar respaldos íntegros de la base de datos PostgreSQL y restaurarlos de forma verificada en casos de contingencia, mantenimiento o migración de infraestructura.

Conforme a la regla establecida en la especificación del sistema:

> _«Una copia de seguridad no se considera suficiente hasta que se ha probado su restauración.»_

---

## 2. Herramientas y Scripts del Sistema

El proyecto incluye comandos integrados en el monorepo y scripts automatizados en la carpeta `scripts/`:

| Comando / Script               | Descripción                                                             | Entorno                   |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------- |
| `npm run db:backup`            | Genera un volcado SQL estructurado con suma de verificación SHA-256.    | Multiplataforma (Node.js) |
| `npm run db:restore [archivo]` | Verifica el checksum SHA-256 y restaura la base de datos destino.       | Multiplataforma (Node.js) |
| `scripts/backup.sh`            | Script bash optimizado para servidores Linux y tareas programadas cron. | Linux / Docker / CI       |
| `scripts/restore.sh [archivo]` | Script bash de restauración para servidores Linux y Docker.             | Linux / Docker / CI       |

---

## 3. Generación de Respaldo (`Backup`)

### 3.1 Ejecución Manual

Desde la raíz del proyecto:

```bash
npm run db:backup
```

O en servidores Linux:

```bash
./scripts/backup.sh
```

### 3.2 Resultado del Respaldo

Los archivos generados se guardan en el directorio `backups/` (ignorado en el control de versiones Git para seguridad):

1. **Archivo SQL:** `backups/backup_liga_quero_AAAA-MM-DD_HH-mm-ss.sql`
   - Incluye sentencias de limpieza previa (`--clean --if-exists`).
   - Sin propietarios rígidos (`--no-owner --no-privileges`) para portabilidad entre servidores.
   - Contiene la totalidad de tablas de auditoría, catálogos, deportistas, campeonatos, actas y tablas de posiciones.
2. **Archivo de Checksum:** `backups/backup_liga_quero_AAAA-MM-DD_HH-mm-ss.sql.sha256`
   - Suma hash criptográfica SHA-256 para garantizar la integridad y detectar corrupción de datos.

---

## 4. Procedimiento de Restauración (`Restore`)

### 4.1 Restauración al Último Respaldo Disponible

Para restaurar el respaldo más reciente de la carpeta `backups/`:

```bash
npm run db:restore
```

### 4.2 Restauración de un Respaldo Específico

```bash
node scripts/restore.js backups/backup_liga_quero_2026-10-09_07-51-48.sql
```

O en Linux:

```bash
./scripts/restore.sh backups/backup_liga_quero_2026-10-09_07-51-48.sql
```

### 4.3 Verificación de Integridad

Antes de ejecutar cualquier comando SQL sobre la base de datos:

1. El script lee el archivo `.sha256`.
2. Calcula el hash SHA-256 del archivo `.sql`.
3. Si los hashes no coinciden, la operación se cancela inmediatamente con código de error, evitando restauraciones parciales o corruptas.

---

## 5. Automatización en Producción (Cron Job)

En el servidor de producción Linux (Ubuntu/Debian), configurar una tarea programada diaria con `crontab -e`:

```cron
# Respaldo diario de la base de datos de la Liga a las 02:00 AM
0 2 * * * cd /opt/liga-cantonal-quero && ./scripts/backup.sh >> /var/log/liga_backup.log 2>&1

# Limpieza de respaldos locales con más de 30 días de antigüedad
30 2 * * * find /opt/liga-cantonal-quero/backups -name "backup_*.sql*" -mtime +30 -exec rm {} \;
```

---

## 6. Respaldo de Archivos Adjuntos (Fotos y Documentos de Inscripción)

Los archivos privados y fotos de deportistas se almacenan en el sistema de archivos fuera de la raíz web en el directorio configurado por `STORAGE_LOCAL_ROOT` (por defecto `./storage` o `/var/liga/storage`).

Para respaldar los archivos físicos:

```bash
tar -czvf backups/storage_backup_$(date +%Y-%m-%d).tar.gz storage/
```

Para restaurar:

```bash
tar -xzvf backups/storage_backup_AAAA-MM-DD.tar.gz -C ./
```

---

## 7. Plan de Recuperación ante Desastres (DRP)

En caso de fallo catastrófico del servidor:

1. Provisionar un nuevo servidor con Docker y Docker Compose según `docs/deployment.md`.
2. Clonar el repositorio y copiar el archivo `.env` seguro.
3. Iniciar el servicio de base de datos: `docker compose up -d db`.
4. Transferir el último archivo de respaldo `.sql` y su `.sha256` a `backups/`.
5. Ejecutar `npm run db:restore`.
6. Transferir y descomprimir los archivos de `storage/`.
7. Iniciar la aplicación NestJS y el frontend web.
8. Verificar el estado del servicio en `http://servidor:3000/api/health`.
