-- ==============================================================
-- Acesso mestre v2 — e-mail mestre + escolha de empresa no login
--
-- Na tela de login: digite o E-MAIL MESTRE + a SENHA MESTRE e aparece a
-- lista de empresas pra escolher qual acessar (entra como admin dela).
--
-- Complementa a 20260716_master_access.sql (rode aquela antes — cria a
-- tabela platform_settings). O modo antigo (e-mail do cliente + senha
-- mestre) continua funcionando também.
--
-- Para usar: cole no SQL Editor do Supabase (projeto NOVO, sbzwtnxx).
-- Depois rode o passo 2 (no fim) definindo e-mail e senha mestres.
-- ==============================================================

SET search_path TO public;

INSERT INTO public.platform_settings (key, value)
VALUES ('master_email', NULL)
ON CONFLICT (key) DO NOTHING;

-- Valida as credenciais mestres e devolve as empresas pra escolher.
-- Credencial errada ou mestre desligado → devolve vazio (mesma cara de
-- login inválido, sem vazar que o acesso mestre existe).
-- ATENÇÃO: 'extensions' no search_path é obrigatório (pgcrypto/crypt mora lá).
CREATE OR REPLACE FUNCTION public.master_list_companies(p_email text, p_password text)
RETURNS TABLE(id uuid, name text, instance text, plan text, active boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_email text;
  v_hash  text;
BEGIN
  SELECT ps.value INTO v_email FROM platform_settings ps WHERE ps.key = 'master_email';
  SELECT ps.value INTO v_hash  FROM platform_settings ps WHERE ps.key = 'master_password_hash';
  IF v_email IS NULL OR v_hash IS NULL THEN RETURN; END IF;
  IF lower(trim(p_email)) <> lower(trim(v_email)) THEN RETURN; END IF;
  IF v_hash <> crypt(p_password, v_hash) THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.instance, c.plan, c.active
    FROM companies c
   ORDER BY c.name;
END;
$$;

-- ==============================================================
-- 2) DEFINIR E-MAIL E SENHA MESTRES (rode separado, trocando os valores):
--
--    UPDATE platform_settings SET value = 'mestre@nexla.com', updated_at = now()
--     WHERE key = 'master_email';
--
--    UPDATE platform_settings
--       SET value = crypt('ESCOLHA-UMA-SENHA-FORTE-AQUI', gen_salt('bf')),
--           updated_at = now()
--     WHERE key = 'master_password_hash';
--
--    Para DESLIGAR tudo: UPDATE platform_settings SET value = NULL
--     WHERE key IN ('master_email', 'master_password_hash');
-- ==============================================================
