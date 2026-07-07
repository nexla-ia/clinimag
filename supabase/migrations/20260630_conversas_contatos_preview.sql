-- ==============================================================
-- Conversas — adiciona "preview" (última mensagem) na lista de contatos
-- Estende api_conversas_contatos para devolver também um texto de preview
-- da última mensagem, SEM trafegar o base64 (mídia vira o rótulo "📎 Mídia").
--
-- Muda a assinatura da função → precisa de DROP antes do CREATE.
-- Para usar: cole no SQL Editor do Supabase do projeto.
-- ==============================================================

SET search_path TO public;

DROP FUNCTION IF EXISTS public.api_conversas_contatos(text);

CREATE FUNCTION public.api_conversas_contatos(p_instancia text)
  RETURNS TABLE(
    numero text, created_at timestamptz, "horaLastMessage" text,
    outside_assumed boolean, preview text
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT
      q.numero, q.created_at, q."horaLastMessage", q.outside_assumed,
      COALESCE(
        NULLIF(btrim(q.mensagem), ''),
        CASE WHEN q.tem_midia THEN '📎 Mídia' ELSE '' END
      ) AS preview
    FROM (
      SELECT DISTINCT ON (m.numero)
        m.numero, m.id, m.created_at, m."horaLastMessage",
        m.mensagem, (m.base64 IS NOT NULL) AS tem_midia,
        agg.outside_assumed
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
