-- ==============================================================
-- PERF Fase 3 — RPC da lista de grupos (CompanyGroups)
-- Substitui o select de até 20.000 mensagens que o front baixava só
-- para extrair os grupos distintos + a última mensagem de cada.
-- Por grupo (idgrupo) devolve a linha mais recente (último remetente,
-- texto, timestamp), ordenado pela mensagem mais recente (id desc).
--
-- Para usar: cole no SQL Editor do Supabase do projeto.
-- ==============================================================

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.api_grupos_lista(p_instancia text)
  RETURNS TABLE(
    idgrupo text, nomegrupo text, mensagem text,
    numero text, nome text, created_at timestamptz, "horaLastMessage" text
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT q.idgrupo, q.nomegrupo, q.mensagem, q.numero, q.nome, q.created_at, q."horaLastMessage"
    FROM (
      SELECT DISTINCT ON (idgrupo)
        idgrupo, nomegrupo, mensagem, numero, nome, id, created_at, "horaLastMessage"
      FROM mensagens_geral
      WHERE instancia = p_instancia
        AND idgrupo IS NOT NULL
      ORDER BY idgrupo, id DESC
    ) q
    ORDER BY q.id DESC;
  $$;

GRANT EXECUTE ON FUNCTION public.api_grupos_lista(text) TO anon, authenticated;
