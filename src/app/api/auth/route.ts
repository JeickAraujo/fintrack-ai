import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryOne, execute } from '@/lib/db';
import { hashPassword, verifyPassword, signToken, seedDefaultUserCategories } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, email, password, name, currency = 'COP' } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // =========================================================================
    // REGISTRO UNIFICADO
    // =========================================================================
    if (action === 'register') {
      if (!name || !name.trim()) {
        return NextResponse.json({ error: 'Nombre requerido para registro' }, { status: 400 });
      }

      if (password.length < 6) {
        return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
      }

      // Verificar si el usuario ya existe
      const existingUser = await queryOne(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
      if (existingUser) {
        return NextResponse.json({ error: 'Este correo electrónico ya tiene una cuenta registrada.' }, { status: 400 });
      }

      const userId = crypto.randomUUID();
      const pwdHash = hashPassword(password);
      const now = new Date().toISOString();

      try {
        // 1. Guardar usuario
        await execute(
          `INSERT INTO users (id, name, email, password_hash, currency, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, name.trim(), cleanEmail, pwdHash, currency, now, now]
        );

        // 2. Sembrar categorías por defecto
        await seedDefaultUserCategories(userId);

        // 3. Crear cuenta principal por defecto
        const defaultAccountId = crypto.randomUUID();
        await execute(
          `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, color, is_active, created_at)
           VALUES (?, ?, ?, 'CHECKING', 0, 0, '#10b981', 1, ?)`,
          [defaultAccountId, userId, 'Cuenta Principal', now]
        );
      } catch (dbErr: any) {
        console.error('[Database Registration Error]:', dbErr);
        return NextResponse.json(
          { error: 'Error al registrar el usuario en la base de datos: ' + (dbErr?.message || String(dbErr)) },
          { status: 500 }
        );
      }

      const sessionUser = { id: userId, name: name.trim(), email: cleanEmail, currency };
      const token = signToken(sessionUser);

      const response = NextResponse.json({ success: true, user: sessionUser });
      response.cookies.set('fintrack_auth_token', token, {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 días
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return response;
    }

    // =========================================================================
    // LOGIN UNIFICADO
    // =========================================================================
    const user = await queryOne<{ id: string; name: string; email: string; password_hash: string; currency: string }>(
      `SELECT id, name, email, password_hash, currency FROM users WHERE email = ?`,
      [cleanEmail]
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    const sessionUser = { id: user.id, name: user.name, email: user.email, currency: user.currency };
    const token = signToken(sessionUser);

    const response = NextResponse.json({ success: true, user: sessionUser });
    response.cookies.set('fintrack_auth_token', token, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    return response;
  } catch (err: any) {
    console.error('[Auth API General Error]:', err);
    return NextResponse.json(
      {
        error: err?.message || 'Error procesando solicitud de autenticación',
      },
      { status: 500 }
    );
  }
}
