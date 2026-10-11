# FinTrack AI — Guía de Ejecución y Manual Técnico

FinTrack AI es un administrador financiero personal inteligente de nivel comercial desarrollado con **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, y persistencia relacional con **PostgreSQL (Supabase)** compatible con despliegues serverless en Vercel.

---

## 🚀 Cómo Iniciar la Aplicación

### 1. Variables de Entorno
Copia `.env.example` a `.env.local` y configura las variables:
```bash
cp .env.example .env.local
```

Asegúrate de definir `JWT_SECRET` y opcionalmente `DATABASE_URL` (para Postgres local o Supabase Postgres) o las variables de Supabase.

### 2. Iniciar el Servidor Local
```bash
# Modo desarrollo
npm run dev

# Modo producción
npm run build
npm run start
```
La aplicación estará disponible en `http://localhost:3000`.

### 3. Ejecutar Pruebas Automatizadas
Para correr la suite de pruebas unitarias que verifican precisión aritmética, deduplicación criptográfica, parsing NLP y las intenciones del Copilot:
```bash
npm test
```

---

## 🌟 Funcionalidades Principales

1. **Autenticación Unificada y Sesión Segura:**
   - Registro de usuario con creación automática de categorías estándar y cuenta principal en una sola operación.
   - Manejo seguro de sesiones mediante cookies `httpOnly`, `sameSite: lax` y `secure` en producción firmadas con `JWT_SECRET`.

2. **Dashboard Financiero en Tiempo Real:**
   - Saldo total disponible y cálculo preciso de flujo de caja e ingresos/gastos mensuales en zona horaria local (`America/Bogota`).
   - Distribución de gastos por categoría y métricas de tasa de ahorro.
   - Registro rápido por lenguaje natural (NLP).

3. **Registro Inteligente de Movimientos & NLP:**
   - Interpreta frases complejas como: *"Hoy gasté 18.000 pesos en almuerzo y 7.000 en transporte"*.
   - Clasificación automática por palabras clave y preservación de balances sin duplicidad contable.

4. **Ingesta de Extractos CSV & Deduplicación Criptográfica:**
   - Detección inteligente de delimitadores (`,` o `;`) y columnas bancarias.
   - Hash SHA-256 para evitar duplicar registros importados repetidamente.

5. **Administrador Completo de Obligaciones & Suscripciones:**
   - Creación, edición, eliminación y pago de compromisos financieros.
   - Al marcar como pagado, se genera la transacción vinculada y se debita la cuenta seleccionada.

6. **Presupuestos Mensuales:**
   - Seguimiento por categoría con barras de consumo y cálculo de remanentes o sobrecostos.

7. **FinTrack Copilot (Asistente Financiero Cuantificado):**
   - Normalización de consultas (sin tildes ni puntuación).
   - Intenciones reales: mayor gasto, saldo por cuenta, presupuestos excedidos, próximos pagos, suscripciones, comparación con el mes anterior y ayuda interactiva.
   - Mensaje explícito con sugerencias válidas ante preguntas no reconocidas.
   - Fallback opcional a Anthropic Claude (`claude-3-5-sonnet`) si `ANTHROPIC_API_KEY` está presente.

8. **Exportación e Informes CSV:**
   - Descargas de extractos mensuales o históricos completos formateados para hojas de cálculo.
