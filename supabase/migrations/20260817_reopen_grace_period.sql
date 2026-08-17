-- ==============================================================
-- Reabrir conversa: SÓ mensagens_geral reabre + carência de 2 min
--
-- Bug "reabre sozinho" (Agência Magnética): conversa finalizada voltava
-- pra Recepção mesmo SEM mensagem nova do cliente. Investigação (monitor
-- ao vivo + dados) mostrou duas coisas:
--
--  1) A trigger reopen_session_on_new_message também está em tabelas
--     AUXILIARES (public.clientes, public.n8n_chat_histories_*). No ramo
--     delas, ela reabria a conversa em QUALQUER insert, sem checar tipo —
--     então uma escrita na memória do n8n (ou re-insert de contato) do
--     mesmo número reabria a conversa sem mensagem nova de verdade.
--     ➜ Agora SÓ mensagens_geral reabre. As auxiliares não reabrem mais.
--
--  2) Corrida de tempo: quem atende "fora" (no WhatsApp) finaliza na
--     plataforma antes da mensagem do cliente cair aqui pelo n8n; quando
--     cai (segundos depois), reabria.
--     ➜ Carência: mensagem do cliente só reabre se a conversa NÃO foi
--        finalizada nos últimos 2 minutos.
--
-- Mantém: só CLIENTE reabre; mensagem de GRUPO mexe no grupo, nunca no
-- individual do participante.
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
  -- SÓ a tabela de mensagens da conversa reabre. Escritas em tabelas
  -- auxiliares (clientes/contatos, memória do n8n) NÃO reabrem — eram elas
  -- que causavam a reabertura "sozinha", sem mensagem nova de verdade.
  IF TG_TABLE_NAME <> 'mensagens_geral' THEN
    RETURN NEW;
  END IF;

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

  IF v_session_id IS NOT NULL THEN
    -- Carência: não reabre se acabou de ser finalizada (< 2 min). Evita o
    -- reabrir da mensagem atrasada (n8n) que o atendente já tratou.
    DELETE FROM public.conversations
     WHERE session_id = v_session_id
       AND (closed_at IS NULL OR closed_at < now() - interval '2 minutes');
  END IF;
  RETURN NEW;
end; $$;
