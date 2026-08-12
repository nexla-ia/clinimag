-- ==============================================================
-- Reabrir conversa: mensagem de GRUPO não reabre o INDIVIDUAL
--
-- Bug (relatado na Agência Magnética): quando um contato manda mensagem
-- num GRUPO, a linha em mensagens_geral vem com numero = o número
-- individual do participante e idgrupo = o grupo. A trigger
-- reopen_session_on_new_message() apagava a "conversa finalizada" usando
-- o `numero` — ou seja, reabria a conversa INDIVIDUAL do participante
-- toda vez que ele falava no grupo. Resultado: conversas finalizadas
-- "voltavam sozinhas" pra Recepção.
--
-- Correção (mensagens_geral):
--   • mensagem de GRUPO (idgrupo preenchido) → reabre, no máximo, a
--     conversa do GRUPO (session_id = idgrupo), NUNCA a do participante;
--   • só o CLIENTE reabre (type 'cliente'/'human', sem diferenciar
--     maiúsculas — no banco vem 'Cliente' com C maiúsculo).
-- As demais tabelas (legado n8n/clientes) seguem como antes.
--
-- Substitui a 20260811. Seguro rodar mais de uma vez. Cole no SQL Editor
-- do Supabase (projeto sbzwtnxx).
-- ==============================================================

CREATE OR REPLACE FUNCTION public.reopen_session_on_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_session_id text;
  v_type       text;
begin
  IF TG_TABLE_NAME = 'mensagens_geral' THEN
    -- Mensagem de grupo reabre (se for o caso) a conversa do GRUPO, e nunca
    -- a conversa individual do participante que mandou.
    IF NEW.idgrupo IS NOT NULL AND NEW.idgrupo <> '' THEN
      v_session_id := NEW.idgrupo;
    ELSE
      v_session_id := NEW.numero;
    END IF;

    -- Só o CLIENTE reabre. Atendente / IA / sistema / lembrete NÃO reabrem.
    v_type := lower(coalesce(NEW.type, ''));
    IF v_type NOT IN ('cliente', 'human') THEN
      RETURN NEW;
    END IF;
  ELSE
    v_session_id := NEW.session_id;
  END IF;

  if v_session_id is not null then
    delete from public.conversations where session_id = v_session_id;
  end if;
  return NEW;
end; $$;
