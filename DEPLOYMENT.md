# FinTrack AI — Guía Completa de Despliegue en Producción

Esta guía describe paso a paso las mejores opciones para desplegar **FinTrack AI** en producción según tus preferencias de infraestructura (Serverless, Docker o VPS tradicional).

---

## Opción 1: Despliegue Rápido en Vercel (Recomendado para Next.js)

Vercel es la plataforma nativa de los creadores de Next.js y ofrece la configuración más rápida y eficiente.

### Paso 1: Subir el código a GitHub / GitLab
1. En la carpeta del proyecto (`C:\Users\ASUS\.gemini\antigravity\scratch\fintrack-ai`), inicializa o vincula tu repositorio Git:
   ```bash
   git init
   git add .
   git commit -m "feat: FinTrack AI v1.0.0"
   git branch -M main
   git remote add origin https://github.com/tu-usuario/fintrack-ai.git
   git push -u origin main
   ```

### Paso 2: Base de Datos en Producción (PostgreSQL)
En entornos *serverless* como Vercel, el sistema de archivos es efímero entre ejecuciones. Para producción permanente, utiliza una base de datos PostgreSQL administrada gratuita:
- **Supabase** ([supabase.com](https://supabase.com))
- **Neon** ([neon.tech](https://neon.tech))
- **Vercel Postgres**

Copia la URL de conexión (`DATABASE_URL=postgres://...`).

### Paso 3: Importar en Vercel
1. Ve a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"Add New..."** > **"Project"** y selecciona el repositorio `fintrack-ai`.
3. En la sección **Environment Variables**, añade:
   - `JWT_SECRET`: Una clave segura de más de 32 caracteres (ej: `fintrack_ai_super_secret_production_key_2026`).
   - `DATABASE_URL`: Tu cadena de conexión de PostgreSQL/Supabase (si migras de SQLite a Postgres).
4. Haz clic en **Deploy**. En menos de 2 minutos tendrás una URL pública con HTTPS automático (`https://tu-proyecto.vercel.app`).

---

## Opción 2: Despliegue con Docker (Cualquier Nube: Render, Railway, AWS, DigitalOcean)

Docker te permite empaquetar la aplicación y mantener el archivo de base de datos persistente mediante un volumen montado.

### 1. Archivo `Dockerfile`
Crea este archivo en la raíz del proyecto (`fintrack-ai/Dockerfile`):

```dockerfile
# Etapa 1: Dependencias y compilación
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Etapa 2: Imagen final optimizada
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src

# Directorio para volumen de persistencia SQLite
RUN mkdir -p /app/data
ENV SQLITE_DB_PATH=/app/data/fintrack.sqlite

EXPOSE 3000

CMD ["npm", "run", "start"]
```

### 2. Archivo `docker-compose.yml`
```yaml
version: '3.8'

services:
  fintrack:
    build: .
    container_name: fintrack-ai
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=cambia_esta_clave_por_una_segura_de_32_caracteres
    volumes:
      - fintrack_data:/app/data

volumes:
  fintrack_data:
```

### 3. Ejecutar localmente con Docker:
```bash
docker compose up -d --build
```
La aplicación quedará corriendo en `http://localhost:3000` con sus datos 100% persistentes en el volumen Docker `fintrack_data`.

---

## Opción 3: Despliegue en Railway o Render (1-Click Hosting)

Ambas plataformas soportan despliegue automático desde GitHub y permiten adjuntar un volumen persistente para SQLite o aprovisionar PostgreSQL con 1 solo clic.

### Pasos en Render / Railway:
1. Conecta tu repositorio de GitHub.
2. Selecciona **Web Service**.
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm run start`
5. En la sección **Disks / Volumes**, añade un disco montado en `/app/data` para que el archivo SQLite persista indefinidamente entre reinicios y actualizaciones.
6. Configura la variable de entorno `JWT_SECRET`.

---

## Opción 4: Servidor VPS propio (Ubuntu / Debian con Nginx y PM2)

Si tienes un servidor Linux (DigitalOcean Droplet, AWS EC2, Hetzner, Linode):

1. **Instalar Node.js y PM2 en el servidor:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs nginx git
   sudo npm install -g pm2
   ```

2. **Clonar y compilar:**
   ```bash
   git clone https://github.com/tu-usuario/fintrack-ai.git /var/www/fintrack-ai
   cd /var/www/fintrack-ai
   npm install
   npm run build
   ```

3. **Ejecutar con PM2 (gestor de procesos):**
   ```bash
   pm2 start npm --name "fintrack" -- start
   pm2 save
   pm2 startup
   ```

4. **Configurar Nginx como Reverse Proxy:**
   Edita `/etc/nginx/sites-available/default`:
   ```nginx
   server {
       listen 80;
       server_name tudominio.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   Reinicia Nginx y añade certificado SSL gratis con Let's Encrypt:
   ```bash
   sudo systemctl restart nginx
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d tudominio.com
   ```

---

## 🔒 Checklist de Seguridad Antes de Publicar

- [ ] Genera un `JWT_SECRET` aleatorio y robusto (usa `openssl rand -base64 32`).
- [ ] Asegúrate de configurar HTTPS (Certbot o Vercel/Cloudflare automático).
- [ ] En un entorno de producción con alta concurrencia, configura copias de seguridad periódicas del archivo SQLite o apunta a una instancia de PostgreSQL.
