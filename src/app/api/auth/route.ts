import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabase';
import { queryOne, execute } from '@/lib/db';
import { hashPassword, verifyPassword, signToken, seedDefaultUserCategories } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, email, password, name, currency = 'COP' } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
    }

    const hasSupabaseConfig = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // =========================================================================
    // FLUJO 1: REGISTRO CON SUPABASE (Producción en la Nube)
    // =========================================================================
    if (hasSupabaseConfig) {
      const supabase = getServiceSupabase();

      if (action === 'register') {
        if (!name) {
          return NextResponse.json({ error: 'Nombre requerido para registro' }, { status: 400 });
        }

        // Registrar usuario en Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.toLowerCase().trim(),
          password,
          options: {
            data: {
              name: name.trim(),
              currency,
            },
          },
        });

        if (authError) {
          console.error('[Supabase Auth Register Error]:', authError.message, authError.status);
          const isDev = process.env.NODE_ENV !== 'production';
          return NextResponse.json(
            {
              error: isDev
                ? `Error en Supabase: ${authError.message}`
                : authError.message.includes('already registered')
                ? 'El usuario ya existe con este correo electrónico'
                : 'Error procesando solicitud de registro en Supabase.',
              details: isDev ? authError.message : undefined,
            },
            { status: 400 }
          );
        }

        const user = authData.user;
        if (!user) {
          return NextResponse.json({ error: 'No se pudo crear el usuario en Supabase' }, { status: 500 });
        }

        // Si la confirmación por correo está requerida y no hay sesión activa aún
        const requiresEmailConfirmation = !authData.session && user.identities?.length;

        // Asegurar que el perfil exista en la tabla profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            currency,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        if (profileError) {
          console.warn('[Supabase Profiles Table Upsert Warning]:', profileError.message);
        }

        // Crear cuenta principal por defecto si no existe
        const { error: accountError } = await supabase
          .from('accounts')
          .insert({
            user_id: user.id,
            name: 'Cuenta Principal',
            type: 'CHECKING',
            initial_balance_cents: 0,
            current_balance_cents: 0,
            color: '#10b981',
          });

        if (accountError) {
          console.warn('[Supabase Accounts Insert Warning]:', accountError.message);
        }

        const sessionUser = {
          id: user.id,
          name: name.trim(),
          email: email.toLowerCase().trim(),
          currency,
        };

        const token = signToken(sessionUser);
        const response = NextResponse.json({
          success: true,
          user: sessionUser,
          requiresEmailConfirmation: Boolean(requiresEmailConfirmation),
          message: requiresEmailConfirmation
            ? 'Cuenta creada. Revisa tu correo para confirmar la cuenta si la confirmación está activa en Supabase.'
            : 'Registro exitoso',
        });

        response.cookies.set('fintrack_auth_token', token, {
          httpOnly: true,
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        });

        return response;
      }

      // Login con Supabase Auth
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (loginError) {
        console.error('[Supabase Auth Login Error]:', loginError.message);
        return NextResponse.json(
          { error: 'Credenciales inválidas o correo no confirmado' },
          { status: 401 }
        );
      }

      const user = loginData.user;
      const userName = user.user_metadata?.name || email.split('@')[0];
      const userCurrency = user.user_metadata?.currency || 'COP';

      const sessionUser = {
        id: user.id,
        name: userName,
        email: user.email || email,
        currency: userCurrency,
      };

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
    }

    // =========================================================================
    // FLUJO 2: MODO LOCAL PERSISTENTE / FALLBACK SQLITE
    // =========================================================================
    if (action === 'register') {
      if (!name) {
        return NextResponse.json({ error: 'Nombre requerido para registro' }, { status: 400 });
      }

      const existingUser = await queryOne(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
      if (existingUser) {
        return NextResponse.json({ error: 'El usuario ya existe con este correo electrónico' }, { status: 400 });
      }

      const userId = crypto.randomUUID();
      const pwdHash = hashPassword(password);
      const now = new Date().toISOString();

      try {
        await execute(
          `INSERT INTO users (id, name, email, password_hash, currency, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, name.trim(), email.toLowerCase().trim(), pwdHash, currency, now, now]
        );

        await seedDefaultUserCategories(userId);

        const defaultAccountId = crypto.randomUUID();
        await execute(
          `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, color, created_at)
           VALUES (?, ?, ?, 'CHECKING', 0, 0, '#10b981', ?)`,
          [defaultAccountId, userId, 'Cuenta Principal', now]
        );
      } catch (dbErr: any) {
        console.error('[Local SQLite DB Error]:', dbErr);
        return NextResponse.json(
          {
            error: 'No se pudo guardar el usuario en el almacenamiento local. Si estás en Vercel, configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.',
          },
          { status: 500 }
        );
      }

      const sessionUser = { id: userId, name: name.trim(), email: email.toLowerCase().trim(), currency };
      const token = signToken(sessionUser);

      const response = NextResponse.json({ success: true, user: sessionUser });
      response.cookies.set('fintrack_auth_token', token, {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'lax',
      });
      return response;
    }

    // Login Local
    const user = await queryOne<{ id: string; name: string; email: string; password_hash: string; currency: string }>(
      `SELECT id, name, email, password_hash, currency FROM users WHERE email = ?`,
      [email.toLowerCase().trim()]
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
      sameSite: 'lax',
    });
    return response;
  } catch (err: any) {
    console.error('[Auth API General Catch]:', err);
    return NextResponse.json(
      {
        error: 'Error procesando solicitud de autenticación',
        diag: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
