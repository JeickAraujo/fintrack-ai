# FinTrack AI — Guía Completa de Despliegue en Producción (Vercel + Supabase)

Esta guía describe los pasos exactos para desplegar **FinTrack AI** en producción en Vercel con Supabase PostgreSQL como base de datos unificada y persistente.

---

## 1. Configurar Supabase (PostgreSQL)

1. Ingresa a [supabase.com](https://supabase.com) y crea un nuevo proyecto (puedes usar el plan gratuito).
2. En el menú lateral izquierdo, haz clic en **SQL Editor** > **New Query**.
3. Copia y pega el contenido completo del archivo [`supabase-schema.sql`](supabase-schema.sql) de este repositorio y presiona **Run**.
   - Esto creará todas las tablas (`users`, `accounts`, `categories`, `transactions`, `payment_obligations`, `budgets`) e índices optimizados.
4. En el menú lateral, ve a **Project Settings** > **Database**.
5. En la sección **Connection string**, selecciona el modo **URI** y copia la cadena:
   ```text
   postgresql://postgres:[TU_CONTRASEÑA]@db.[TU_REF].supabase.co:5432/postgres
   ```
   *(Reemplaza `[TU_CONTRASEÑA]` con la contraseña maestra que definiste al crear el proyecto).*

---

## 2. Configurar y Desplegar en Vercel

1. Sube tu código a GitHub o GitLab en una rama (por ejemplo, `main` o tu rama de producción).
2. Entra a [vercel.com](https://vercel.com) e inicia sesión.
3. Haz clic en **Add New...** > **Project** y selecciona el repositorio de FinTrack AI.
4. En **Framework Preset**, Vercel detectará automáticamente **Next.js**.
5. En la sección **Environment Variables**, añade:

| Variable | Valor | Obligatorio |
| :--- | :--- | :--- |
| `JWT_SECRET` | Cadena aleatoria segura de al menos 32 caracteres (ej: `fintrack_super_secret_jwt_prod_key_2026!`) | **Sí** |
| `DATABASE_URL` | La URI de conexión de Supabase copiada en el paso 1 (`postgresql://postgres:...`) | **Sí** |
| `NODE_ENV` | `production` | **Sí** |
| `ANTHROPIC_API_KEY` | *(Opcional)* Tu API Key de Anthropic para respuestas avanzadas de IA en Copilot | No |

6. Haz clic en **Deploy**.
7. En aproximadamente 1-2 minutos, tu aplicación estará 100% activa en tu dominio Vercel (`https://tu-proyecto.vercel.app`).

---

## 3. Comandos Locales de Verificación

Si deseas verificar el proyecto localmente antes o después del despliegue:

```bash
# Ejecutar suite de pruebas unitarias
npm test

# Ejecutar compilación de producción de Next.js
npm run build

# Iniciar servidor local
npm run start
```
