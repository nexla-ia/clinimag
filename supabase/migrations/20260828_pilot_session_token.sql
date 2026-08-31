-- ==============================================================
-- FASE 0 (piloto) — "crachá" de sessão assinado no banco + RLS por tenant
--
-- Projeto usa JWT HS256 (segredo compartilhado), então dá pra assinar um
-- token DENTRO do banco (extensions.sign) que o PostgREST aceita. O token
-- carrega a `instancia` da clínica; as políticas RLS passam a filtrar por ela.
--
-- Esta migration NÃO fecha nenhuma tabela ainda — só cria o mecanismo e as
-- funções de teste. É segura de rodar (não muda o comportamento do app).
--
-- ⚠️ ANTES de rodar isto, guarde o JWT secret (passo no fim do arquivo).
-- Cole no SQL Editor do Supabase (produção sbzwtnxx). Idempotente.
-- ==============================================================

-- pgjwt (sign/verify) — normalmente já existe no Supabase; garante idempotente
CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;

-- Cofre de segredos: RLS ligado e SEM policy → nem anon nem authenticated leem;
-- só funções SECURITY DEFINER (que rodam como owner) enxergam.
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- ── Emite o crachá após validar login (senha do usuário) ──────────────────
-- Devolve { user: {...}, token: '<jwt>' } ou NULL se a credencial não bate.
CREATE OR REPLACE FUNCTION public.login_session(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  u          record;
  v_secret   text;
  v_instancia text;
  v_token    text;
BEGIN
  SELECT value INTO v_secret FROM app_secrets WHERE key = 'jwt_secret';
  IF v_secret IS NULL THEN RAISE EXCEPTION 'jwt_secret não configurado em app_secrets'; END IF;

  SELECT usr.* INTO u
    FROM public.users usr
   WHERE usr.email = p_email
     AND usr.active = true
     AND usr.password_hash = crypt(p_password, usr.password_hash)
   LIMIT 1;
  IF u.id IS NULL THEN RETURN NULL; END IF;

  SELECT c.instance INTO v_instancia FROM public.companies c WHERE c.id = u.company_id;

  v_token := extensions.sign(
    json_build_object(
      'role', 'authenticated', 'aud', 'authenticated', 'iss', 'clinimag',
      'sub', u.id::text, 'email', u.email,
      'company_id', u.company_id::text, 'instancia', v_instancia,
      'user_role', u.role, 'is_master', false,
      'iat', extract(epoch FROM now())::int,
      'exp', extract(epoch FROM now() + interval '24 hours')::int
    )::json,
    v_secret
  );

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id, 'name', u.name, 'email', u.email,
      'role', u.role, 'active', u.active, 'company_id', u.company_id),
    'token', v_token
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.login_session(text, text) TO anon, authenticated;

-- ── Smoke test: devolve os claims que o PostgREST extraiu do token ────────
CREATE OR REPLACE FUNCTION public.whoami()
RETURNS jsonb LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
GRANT EXECUTE ON FUNCTION public.whoami() TO anon, authenticated;

-- ── TEMPORÁRIO (só p/ o smoke test do Claude): emite um token p/ uma
-- instancia sem senha, protegido por um PIN. Será REMOVIDO após validar.
CREATE OR REPLACE FUNCTION public._pilot_debug_mint(p_instancia text, p_pin text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_secret text;
BEGIN
  IF p_pin <> 'nx-pilot-7Kq2' THEN RETURN NULL; END IF;
  SELECT value INTO v_secret FROM app_secrets WHERE key = 'jwt_secret';
  IF v_secret IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.sign(
    json_build_object(
      'role','authenticated','aud','authenticated','iss','clinimag',
      'sub','00000000-0000-0000-0000-000000000000','email','pilot@debug',
      'instancia', p_instancia, 'is_master', false,
      'iat', extract(epoch FROM now())::int,
      'exp', extract(epoch FROM now() + interval '1 hour')::int
    )::json, v_secret);
END;
$$;
GRANT EXECUTE ON FUNCTION public._pilot_debug_mint(text, text) TO anon, authenticated;

-- ==============================================================
-- PASSO OBRIGATÓRIO — guardar o JWT secret (rode SEPARADO, colando o segredo):
--
--   No Supabase Dashboard → Project Settings → API → "JWT Settings" →
--   copie o campo "JWT Secret" (uma string longa) e cole abaixo, AQUI no
--   SQL Editor (NUNCA no chat):
--
--   INSERT INTO public.app_secrets (key, value)
--   VALUES ('jwt_secret', 'COLE_O_JWT_SECRET_AQUI')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
-- ==============================================================
