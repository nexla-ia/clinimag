-- ==============================================================
-- Reabrir conversa finalizada SÓ quando o CLIENTE manda mensagem
--
-- Bug: a trigger reopen_session_on_new_message() apagava a linha de
-- "conversa finalizada" (public.conversations) a CADA mensagem nova em
-- mensagens_geral — inclusive mensagens de atendente/IA/sistema e o
-- LEMBRETE automático de agendamento e o aviso "▶ Atendimento assumido".
-- Resultado: conversas finalizadas "abriam sozinhas".
--
-- Correção: na mensagens_geral, só reabre quando NEW.type é do cliente
-- ('cliente'/'human'). As demais tabelas (legado n8n/clientes) seguem
-- como antes.
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase (sbzwtnxx).
-- ==============================================================

CREATE OR REPLACE FUNCTION public.reopen_session_on_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_session_id text;
  v_type       text;
begin
  IF TG_TABLE_NAME = 'mensagens_geral' THEN
    v_session_id := NEW.numero;
    v_type := lower(coalesce(NEW.type, ''));
    -- Só o CLIENTE reabre. Atendente / IA / sistema / lembrete NÃO reabrem.
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
