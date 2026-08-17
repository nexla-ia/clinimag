-- ==============================================================
-- Reabrir conversa: carência de 2 min (evita "reabre sozinho")
--
-- Cenário (relatado na Agência Magnética, que atende MUITO fora — direto
-- no WhatsApp): o atendente vê a mensagem do cliente no WhatsApp e
-- finaliza na plataforma. A MESMA mensagem do cliente chega na plataforma
-- com atraso (n8n) alguns segundos DEPOIS do finalizar, e reabre a
-- conversa — dando a impressão de que ela "voltou sozinha" pra Recepção.
--
-- Correção: a mensagem do cliente só reabre se a conversa NÃO foi
-- finalizada nos últimos 2 minutos. Assim a mensagem que você acabou de
-- tratar (e que chegou atrasada) não reabre; mas uma mensagem nova de
-- verdade (minutos/horas depois) reabre normalmente.
--
-- Mantém tudo das anteriores: só CLIENTE reabre; mensagem de GRUPO mexe
-- no grupo, nunca no individual do participante.
--
-- Substitui a 20260812. Seguro rodar mais de uma vez. Cole no SQL Editor
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
    -- Grupo reabre (no máximo) a conversa do GRUPO, nunca a do participante.
    IF NEW.idgrupo IS NOT NULL AND NEW.idgrupo <> '' THEN
      v_session_id := NEW.idgrupo;
    ELSE
      v_session_id := NEW.numero;
    END IF;
    -- Só o CLIENTE reabre.
    v_type := lower(coalesce(NEW.type, ''));
    IF v_type NOT IN ('cliente', 'human') THEN
      RETURN NEW;
    END IF;
  ELSE
    v_session_id := NEW.session_id;
  END IF;

  if v_session_id is not null then
    -- Carência: não reabre se acabou de ser finalizada (< 2 min). Evita o
    -- "reabre sozinho" da mensagem atrasada que o atendente já tratou.
    delete from public.conversations
     where session_id = v_session_id
       and (closed_at is null or closed_at < now() - interval '2 minutes');
  end if;
  return NEW;
end; $$;
