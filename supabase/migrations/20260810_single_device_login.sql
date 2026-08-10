-- ==============================================================
-- Login em UM ÚNICO dispositivo (anti conta compartilhada)
-- Cada usuário só pode ter uma sessão ativa por vez. Se já houver
-- alguém usando a conta (sessão "fresca", com heartbeat recente), um
-- novo login é BLOQUEADO com a mensagem "já tem uma pessoa utilizando
-- essa conta no momento".
--
-- Como funciona:
--   users.session_token    → token do dispositivo dono da sessão
--   users.session_seen_at  → último "heartbeat" (o app bate a cada ~45s)
--   claim_login_session    → tenta ASSUMIR a sessão. Só consegue se
--                            estiver livre (token nulo), se já for dele
--                            (mesmo token) ou se a sessão do outro estiver
--                            velha (sem heartbeat há mais de p_ttl_seconds).
--   touch_login_session    → heartbeat; devolve false se OUTRO dispositivo
--                            assumiu a conta (aí o app desloga este aqui).
--   release_login_session  → solta a sessão no logout.
--
-- Degradação: enquanto esta migração não roda, o app entra normal (sem
-- travar), então pode rodar a qualquer momento. Seguro rodar mais de uma
-- vez. Cole no SQL Editor do Supabase (projeto sbzwtnxx).
-- ==============================================================

SET search_path TO public;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS session_token   text,
  ADD COLUMN IF NOT EXISTS session_seen_at timestamptz;

-- Tenta assumir a sessão do usuário para o dispositivo p_token.
-- Devolve { "ok": true } se conseguiu; { "ok": false } se já tem
-- outra pessoa com sessão ativa (fresca).
CREATE OR REPLACE FUNCTION public.claim_login_session(
  p_user_id uuid, p_token text, p_ttl_seconds int DEFAULT 130)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  UPDATE public.users
     SET session_token = p_token, session_seen_at = now()
   WHERE id = p_user_id
     AND ( session_token IS NULL
        OR session_token = p_token
        OR session_seen_at IS NULL
        OR session_seen_at < now() - make_interval(secs => p_ttl_seconds) );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', n > 0);
END;
$$;

-- Heartbeat: mantém a sessão viva. Devolve false se o token não for mais
-- o dono (outro dispositivo assumiu) — o app usa isso pra deslogar aqui.
CREATE OR REPLACE FUNCTION public.touch_login_session(
  p_user_id uuid, p_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE cur text;
BEGIN
  SELECT session_token INTO cur FROM public.users WHERE id = p_user_id;
  IF cur IS DISTINCT FROM p_token THEN
    RETURN false;
  END IF;
  UPDATE public.users SET session_seen_at = now() WHERE id = p_user_id;
  RETURN true;
END;
$$;

-- Solta a sessão (logout), só se o token for o dono atual.
CREATE OR REPLACE FUNCTION public.release_login_session(
  p_user_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.users
     SET session_token = NULL, session_seen_at = NULL
   WHERE id = p_user_id AND session_token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_login_session(uuid, text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_login_session(uuid, text)      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_login_session(uuid, text)     TO anon, authenticated, service_role;
