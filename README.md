# FinTrack AI — Guía de Ejecución y Manual Técnico

FinTrack AI es un administrador financiero personal inteligente de nivel comercial desarrollado con **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, y persistencia relacional con **SQLite**.

---

## 🚀 Cómo Iniciar la Aplicación

El proyecto se encuentra listo en el directorio:
`C:\Users\ASUS\.gemini\antigravity\scratch\fintrack-ai`

### 1. Servidor en ejecución activa
El servidor de producción está actualmente compilado y sirviendo en:
👉 **`http://localhost:3000`**

Para iniciar o reiniciar el servidor manualmente en cualquier momento:
```bash
# Modo desarrollo
npm run dev

# Modo producción
npm run build
npm run start
```

### 2. Ejecutar Pruebas Automatizadas
Para correr la suite de pruebas unitarias que verifican precisión aritmética, deduplicación criptográfica y parsing NLP:
```bash
npm test
```

---

## 💼 Credenciales de Prueba Creadas

Para ingresar inmediatamente sin registrarse de nuevo, puede utilizar la cuenta de prueba generada durante los tests de verificación:
- **Correo:** `juan@test.com`
- **Contraseña:** `Password123!`

O registrar una cuenta propia desde [`/login`](http://localhost:3000/login).

---

## 🌟 Funcionalidades Implementadas

1. **Dashboard Financiero en Tiempo Real:**
   - Saldo total consolidado en todas las cuentas activas.
   - Ingresos y egresos del mes calculados a partir de transacciones reales.
   - Dinero comprometido en obligaciones pendientes.
   - Distribución de gastos por categoría con barras de progreso interactivo.
   - Barra de registro rápido en lenguaje natural en la parte superior.

2. **Registro Inteligente de Movimientos & NLP:**
   - Interpreta frases como: *"Hoy gasté 18.000 pesos en almuerzo y 7.000 en transporte"*.
   - Extrae comercio, montos y categorías sugeridas automáticamente pidiendo confirmación al usuario antes de persistir.
   - Soporte para Gastos, Ingresos, Transferencias entre cuentas (sin alterar patrimonio neto ni duplicar registros) y Compras a Crédito.

3. **Ingesta de Extractos CSV & Notificaciones Bancarias:**
   - Detección inteligente de encabezados (Fecha, Monto, Débito, Crédito, Concepto).
   - Deduplicación criptográfica mediante hash SHA-256 (`SHA256(usuario + cuenta + fecha + monto + concepto)`).
   - Extractor de mensajes SMS o notificaciones de aplicaciones bancarias (Bancolombia, Nequi, etc.).

4. **Administrador de Obligaciones & Suscripciones:**
   - Control de servicios públicos, arriendos, cuotas educativas y suscripciones digitales (Netflix, Spotify, etc.).
   - Acción "Marcar como pagado": debita el dinero de la cuenta seleccionada, genera la transacción de egreso y enlaza el ID sin duplicar el compromiso contable.

5. **Presupuestos Mensuales & Alertas:**
   - Creación de presupuestos por categoría.
   - Visualización de % consumido con alertas de proximidad a límites.

6. **FinTrack Copilot (Asistente IA):**
   - Responde preguntas reales (*"¿En qué gasté más este mes?"*, *"¿Cuánto dinero puedo gastar hasta fin de mes?"*, *"¿Qué suscripciones estoy pagando?"*).
   - Consultas deterministas respaldadas por SQL relacional: **cero alucinaciones financieras**.

7. **Informes y Exportación CSV:**
   - Exportación de movimientos filtrados por mes o descarga de histórico completo compatible con Microsoft Excel y Google Sheets.
