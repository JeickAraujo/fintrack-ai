import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { queryOne, execute } from './db';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CONFIGURACIÓN INCOMPLETA: La variable de entorno JWT_SECRET es obligatoria en producción. Configúrala en Vercel con un valor aleatorio de al menos 32 caracteres.'
      );
    }
    return 'fintrack_dev_local_secret_min_32_characters_123456';
  }
  return secret;
}

export const TOKEN_COOKIE = 'fintrack_auth_token';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  currency: string;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(user: UserSession): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      currency: user.currency,
    },
    getJwtSecret(),
    { expiresIn: '30d' }
  );
}

export function verifyToken(token: string): UserSession | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as UserSession;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Obtiene la sesión actual desde los encabezados de la solicitud (Next.js App Router)
 */
export async function getSessionFromRequest(req: Request): Promise<UserSession | null> {
  const cookieHeader = req.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies[TOKEN_COOKIE];

  if (!token) return null;
  return verifyToken(token);
}

function parseCookies(cookieString: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieString) return list;

  cookieString.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts[0]?.trim();
    const val = parts.slice(1).join('=').trim();
    if (key) list[key] = decodeURIComponent(val);
  });

  return list;
}

/**
 * Crea las categorías por defecto para un nuevo usuario
 */
export async function seedDefaultUserCategories(userId: string): Promise<void> {
  const defaults = [
    { name: 'Alimentación', type: 'EXPENSE', icon: 'Utensils', color: '#f59e0b', keywords: 'restaurante,almuerzo,cena,supermercado,comida,d1,éxito,carulla,oxxo,ubereats,rappi' },
    { name: 'Transporte', type: 'EXPENSE', icon: 'Car', color: '#3b82f6', keywords: 'gasolina,uber,didi,taxi,combustible,peaje,metro,bus,transmilenio' },
    { name: 'Vivienda', type: 'EXPENSE', icon: 'Home', color: '#8b5cf6', keywords: 'arriendo,alquiler,administracion,hipoteca' },
    { name: 'Servicios Públicos', type: 'EXPENSE', icon: 'Zap', color: '#eab308', keywords: 'luz,agua,gas,energia,epm,enel,acueducto,internet,claro,tigo,movistar' },
    { name: 'Suscripciones', type: 'EXPENSE', icon: 'PlaySquare', color: '#ec4899', keywords: 'netflix,spotify,youtube,amazon prime,disney,apple,icloud,google storage,chatgpt' },
    { name: 'Salud y Bienestar', type: 'EXPENSE', icon: 'HeartPulse', color: '#ef4444', keywords: 'farmacia,drogueria,medico,cita,odontologia,eps,prepaga,gimnasio,smartfit' },
    { name: 'Educación', type: 'EXPENSE', icon: 'GraduationCap', color: '#14b8a6', keywords: 'universidad,colegio,curso,platzi,udemy,libros' },
    { name: 'Tecnología', type: 'EXPENSE', icon: 'Laptop', color: '#06b6d4', keywords: 'hardware,software,computador,celular,apple store' },
    { name: 'Entretenimiento', type: 'EXPENSE', icon: 'Film', color: '#f97316', keywords: 'cine,concierto,bar,fiesta,juegos,steam' },
    { name: 'Compras Personales', type: 'EXPENSE', icon: 'ShoppingBag', color: '#6366f1', keywords: 'ropa,zapatos,tienda,amazon,falabella,zara' },
    { name: 'Tarjetas y Deudas', type: 'EXPENSE', icon: 'CreditCard', color: '#64748b', keywords: 'cuota,prestamo,pago tarjeta,intereses' },
    // Ingresos
    { name: 'Salario / Sueldo', type: 'INCOME', icon: 'Briefcase', color: '#10b981', keywords: 'nomina,sueldo,salario,pago empresa' },
    { name: 'Honorarios / Freelance', type: 'INCOME', icon: 'DollarSign', color: '#059669', keywords: 'honorarios,freelance,consultoria,proyecto' },
    { name: 'Rendimientos / Inversiones', type: 'INCOME', icon: 'TrendingUp', color: '#047857', keywords: 'dividendos,intereses,cdts,acciones' },
    { name: 'Otros Ingresos', type: 'INCOME', icon: 'PlusCircle', color: '#34d399', keywords: 'regalo,devolucion,reembolso,venta' },
  ];

  for (const cat of defaults) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO categories (id, user_id, name, type, icon, color, keywords, is_system, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, true, ?)`,
      [id, userId, cat.name, cat.type, cat.icon, cat.color, cat.keywords, now]
    );
  }
}

/**
 * Asegura que el usuario tenga categorías por defecto (auto-reparación en caso de cuentas previas)
 */
export async function ensureDefaultUserCategories(userId: string): Promise<void> {
  try {
    const existing = await queryOne<{ count: number | string }>(
      `SELECT COUNT(*) as count FROM categories WHERE user_id = ?`,
      [userId]
    );
    if (existing && Number(existing.count) > 0) return;
    await seedDefaultUserCategories(userId);
  } catch (err) {
    console.warn('Error en ensureDefaultUserCategories:', err);
  }
}

/**
 * Asegura que el usuario tenga al menos una cuenta activa por defecto
 */
export async function ensureDefaultAccount(userId: string): Promise<void> {
  try {
    const existing = await queryOne<{ count: number | string }>(
      `SELECT COUNT(*) as count FROM accounts WHERE user_id = ?`,
      [userId]
    );
    if (existing && Number(existing.count) > 0) return;
    const defaultAccountId = crypto.randomUUID();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, color, is_active, created_at)
       VALUES (?, ?, 'Cuenta Principal', 'CHECKING', 0, 0, '#10b981', true, ?)`,
      [defaultAccountId, userId, now]
    );
  } catch (err) {
    console.warn('Error en ensureDefaultAccount:', err);
  }
}
