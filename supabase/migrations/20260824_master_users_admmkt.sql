-- ==============================================================
-- Segundo usuário mestre (admmkt) — acesso mestre multi-usuário
--
-- Mantém compatibilidade total com o mestre atual (adm.meg via
-- platform_settings). Adiciona tabela master_users para novos
-- mestres. master_list_companies passa a aceitar ambos.
--
-- IMPORTANTE: rode no SQL Editor do Supabase (projeto sbzwtnxx).
-- Depois execute o passo 2 (no fim deste arquivo) para criar o
-- usuário admmkt com a senha escolhida.
-- ==============================================================

SET search_path TO 'public', 'extensions';

-- 1a) Tabela de mestres adicionais (RLS sem policy — só SECURITY DEFINER acessa)
CREATE TABLE IF NOT EXISTS public.master_users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  email         text        NOT NULL UNIQUE,
  password_hash text        NOT NULL,
  active        boolean     DEFAULT true,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.master_users ENABLE ROW LEVEL SECURITY;

-- 1b) Reescreve master_list_companies para aceitar platform_settings OU master_users
CREATE OR REPLACE FUNCTION public.master_list_companies(p_email text, p_password text)
RETURNS TABLE(id uuid, name text, instance text, plan text, active boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_email text;
  v_hash  text;
  v_ok    boolean := false;
BEGIN
  -- Tenta o mestre legado (platform_settings)
  SELECT ps.value INTO v_email FROM platform_settings ps WHERE ps.key = 'master_email';
  SELECT ps.value INTO v_hash  FROM platform_settings ps WHERE ps.key = 'master_password_hash';

  IF v_email IS NOT NULL AND v_hash IS NOT NULL
     AND lower(trim(p_email)) = lower(trim(v_email))
     AND v_hash = crypt(p_password, v_hash)
  THEN
    v_ok := true;
  END IF;

  -- Se não bateu, tenta master_users
  IF NOT v_ok THEN
    SELECT (mu.password_hash = crypt(p_password, mu.password_hash)) INTO v_ok
      FROM master_users mu
     WHERE mu.active = true
       AND lower(trim(mu.email)) = lower(trim(p_email))
     LIMIT 1;
  END IF;

  IF NOT v_ok OR v_ok IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.instance, c.plan, c.active
    FROM companies c
   ORDER BY c.name;
END;
$$;

-- ==============================================================
-- 2) CRIAR O USUÁRIO admmkt (rode separado no SQL Editor,
--    trocando SENHA-FORTE-AQUI pela senha real):
--
--    INSERT INTO public.master_users (name, email, password_hash)
--    VALUES (
--      'admmkt',
--      'admmkt@medmag.com.br',
--      crypt('SENHA-FORTE-AQUI', gen_salt('bf'))
--    )
--    ON CONFLICT (email) DO UPDATE
--      SET password_hash = EXCLUDED.password_hash,
--          name          = EXCLUDED.name,
--          active        = true;
--
--    Para desativar o admmkt:
--    UPDATE public.master_users SET active = false
--     WHERE email = 'admmkt@medmag.com.br';
-- ==============================================================
