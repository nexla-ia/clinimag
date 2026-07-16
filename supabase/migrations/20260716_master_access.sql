-- ==============================================================
-- Acesso mestre — login em QUALQUER conta com a senha mestre
--
-- Na tela de login: digite o e-mail de qualquer usuário + a SENHA MESTRE
-- e o login entra como aquele usuário (qualquer empresa). Uso: suporte da
-- equipe Nexla acessar a conta das clínicas.
--
-- Segurança:
--   • A senha mestre NÃO fica no código nem neste arquivo — só o hash
--     bcrypt dela, numa tabela sem acesso público (RLS sem policy).
--   • Enquanto o hash não for definido, o acesso mestre fica DESLIGADO.
--   • Para trocar/desligar, é só rodar o UPDATE do passo 2 de novo.
--
-- Para usar: cole no SQL Editor do Supabase (projeto NOVO, sbzwtnxx).
-- Depois rode o passo 2 (no fim do arquivo) com a senha que você escolher.
-- ==============================================================

SET search_path TO public;

-- 1a) Tabela de configurações da plataforma (fechada: RLS ligado, sem policy
--     de acesso — nem o anon key lê; só funções SECURITY DEFINER).
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_settings (key, value)
VALUES ('master_password_hash', NULL)
ON CONFLICT (key) DO NOTHING;

-- 1b) login_user passa a aceitar também a senha mestre
-- ATENÇÃO: o search_path PRECISA incluir 'extensions' — é lá que o Supabase
-- instala o pgcrypto (crypt/gen_salt). Só 'public' quebra TODO o login.
CREATE OR REPLACE FUNCTION public.login_user(p_email text, p_password text)
RETURNS TABLE(id uuid, name text, email text, role text, active boolean, company_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_master text;
BEGIN
  SELECT ps.value INTO v_master
    FROM platform_settings ps
   WHERE ps.key = 'master_password_hash';

  RETURN QUERY
  SELECT u.id, u.name, u.email, u.role, u.active, u.company_id
    FROM public.users u
   WHERE u.email = p_email
     AND u.active = true
     AND (
       u.password_hash = crypt(p_password, u.password_hash)
       OR (v_master IS NOT NULL AND v_master = crypt(p_password, v_master))
     );
END;
$$;

-- ==============================================================
-- 2) DEFINIR A SENHA MESTRE (rode separado, trocando o texto):
--
--    UPDATE platform_settings
--       SET value = crypt('ESCOLHA-UMA-SENHA-FORTE-AQUI', gen_salt('bf')),
--           updated_at = now()
--     WHERE key = 'master_password_hash';
--
--    Para DESLIGAR o acesso mestre:
--
--    UPDATE platform_settings SET value = NULL
--     WHERE key = 'master_password_hash';
-- ==============================================================
