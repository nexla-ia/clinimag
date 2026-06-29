-- ==============================================================
-- PERF Fase 3 — RPC da lista de contatos das conversas (WhatsApp)
-- Substitui o select de até 50.000 mensagens que o front baixava só
-- para extrair ~200-500 contatos únicos (último contato + flag de
-- "já teve atendente humano").
--
-- Por contato (numero) devolve: a mensagem mais recente (created_at +
-- horaLastMessage, para o front calcular o timestamp igual antes) e
-- outside_assumed = se em ALGUM momento teve mensagem de atendente/humano.
-- Ordenado pela mensagem mais recente (id desc), como o JS fazia.
--
-- Bônus: antes o cap de 50k podia truncar contatos antigos e a flag
-- outside_assumed; agora considera todo o histórico.
--
-- Para usar: cole no SQL Editor do Supabase do projeto.
-- ==============================================================

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.api_conversas_contatos(p_instancia text)
  RETURNS TABLE(numero text, created_at timestamptz, "horaLastMessage" text, outside_assumed boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT q.numero, q.created_at, q."horaLastMessage", q.outside_assumed
    FROM (
      SELECT DISTINCT ON (m.numero)
        m.numero, m.id, m.created_at, m."horaLastMessage", agg.outside_assumed
      FROM mensagens_geral m
      JOIN (
        SELECT numero,
               bool_or(lower(type) IN ('atendente', 'humano')) AS outside_assumed
        FROM mensagens_geral
        WHERE instancia = p_instancia
          AND idgrupo IS NULL
          AND (aplicativo = 'whatsapp' OR aplicativo IS NULL)
          AND numero IS NOT NULL
          AND numero NOT LIKE '%@g.us'
        GROUP BY numero
      ) agg ON agg.numero = m.numero
      WHERE m.instancia = p_instancia
        AND m.idgrupo IS NULL
        AND (m.aplicativo = 'whatsapp' OR m.aplicativo IS NULL)
        AND m.numero IS NOT NULL
        AND m.numero NOT LIKE '%@g.us'
      ORDER BY m.numero, m.id DESC
    ) q
    ORDER BY q.id DESC;
  $$;

GRANT EXECUTE ON FUNCTION public.api_conversas_contatos(text) TO anon, authenticated;
