-- ==============================================================
-- Reações — casar a instância SEM diferenciar maiúscula/minúscula
--
-- Problema: set_message_reaction casava `instancia = p_instancia` (exato).
-- Quando a instância é gravada numa caixa (ex.: "NEXLA") mas o n8n/Evolution
-- manda o nome em outra (ex.: "nexla") no evento de reação, o UPDATE não
-- achava a linha → a reação não gravava (só nessa instância). As demais
-- (magnetica, alessandra…) funcionam porque já batem a caixa.
--
-- Correção: comparar por lower(instancia). Seguro — nenhuma instância difere
-- apenas por maiúscula/minúscula.
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase (sbzwtnxx).
-- ==============================================================

CREATE OR REPLACE FUNCTION public.set_message_reaction(
  p_instancia text, p_id_mensagem text, p_reaction text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  UPDATE public.mensagens_geral
     SET reaction = NULLIF(btrim(coalesce(p_reaction, '')), '')
   WHERE lower(instancia) = lower(p_instancia)
     AND id_mensagem = p_id_mensagem;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_message_reaction(text, text, text) TO anon, authenticated, service_role;
