-- ==============================================================================
-- FINTRACK AI — ESQUEMA RELACIONAL SEGURO CON RLS Y TRIGGERS PARA SUPABASE
-- Ejecuta este script completo en el SQL Editor de tu proyecto Supabase
-- ==============================================================================

-- 1. Tabla de Perfiles vinculada directamente a auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'COP',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Habilitar Row Level Security (RLS) en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas estrictas: Cada usuario sólo puede leer, crear y actualizar su propio perfil
DROP POLICY IF EXISTS "Los usuarios pueden leer su propio perfil" ON public.profiles;
CREATE POLICY "Los usuarios pueden leer su propio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Los usuarios pueden insertar su propio perfil" ON public.profiles;
CREATE POLICY "Los usuarios pueden insertar su propio perfil"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Los usuarios pueden actualizar su propio perfil" ON public.profiles;
CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Trigger para crear perfil automáticamente en registro si se usa Supabase Auth directo
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, currency)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'Usuario'),
    new.email,
    COALESCE(new.raw_user_meta_data->>'currency', 'COP')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Tabla de Cuentas Financieras con RLS
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- CHECKING, SAVINGS, CASH, WALLET, CREDIT_CARD
  initial_balance_cents BIGINT NOT NULL DEFAULT 0,
  current_balance_cents BIGINT NOT NULL DEFAULT 0,
  credit_limit_cents BIGINT DEFAULT 0,
  color TEXT DEFAULT '#10b981',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento total de cuentas por usuario" ON public.accounts;
CREATE POLICY "Aislamiento total de cuentas por usuario"
  ON public.accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Tabla de Categorías con RLS
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- EXPENSE, INCOME
  icon TEXT NOT NULL DEFAULT 'Tag',
  color TEXT NOT NULL DEFAULT '#64748b',
  keywords TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categorias visibles por usuario o del sistema" ON public.categories;
CREATE POLICY "Categorias visibles por usuario o del sistema"
  ON public.categories FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios administran sus propias categorias" ON public.categories;
CREATE POLICY "Usuarios administran sus propias categorias"
  ON public.categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Tabla de Transacciones con RLS
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  destination_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL, -- EXPENSE, INCOME, TRANSFER, CREDIT_PURCHASE, REFUND
  amount_cents BIGINT NOT NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'CLEARED',
  notes TEXT,
  import_hash TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento total de transacciones por usuario" ON public.transactions;
CREATE POLICY "Aislamiento total de transacciones por usuario"
  ON public.transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. Tabla de Obligaciones de Pago (Bills) con RLS
CREATE TABLE IF NOT EXISTS public.payment_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  due_date DATE NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'MONTHLY',
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  is_subscription BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.payment_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento total de obligaciones por usuario" ON public.payment_obligations;
CREATE POLICY "Aislamiento total de obligaciones por usuario"
  ON public.payment_obligations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Tabla de Presupuestos con RLS
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  allocated_cents BIGINT NOT NULL,
  alert_70_sent BOOLEAN NOT NULL DEFAULT false,
  alert_90_sent BOOLEAN NOT NULL DEFAULT false,
  alert_100_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento total de presupuestos por usuario" ON public.budgets;
CREATE POLICY "Aislamiento total de presupuestos por usuario"
  ON public.budgets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
