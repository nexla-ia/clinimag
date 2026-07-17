-- ==============================================================
-- CORREÇÃO URGENTE — send_mensagem_geral estava RETURNS uuid, mas
-- mensagens_geral.id é INTEIRO. O "RETURNING id INTO v_id (uuid)" quebrava
-- em TODA chamada (erro 22P02), derrubando o envio de mensagem no painel.
--
-- Esta versão volta a RETURNS void e mantém o p_quoted (grava a citação
-- na própria inserção, atômico). Substitui a função da 20260717_mensagens_quoted.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase (projeto NOVO, sbzwtnxx).
-- ==============================================================

SET search_path TO public;

-- Remove qualquer versão anterior (inclui a bugada RETURNS uuid)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'send_mensagem_geral' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE FUNCTION public.send_mensagem_geral(
  p_instancia text,
  p_numero    text,
  p_mensagem  text,
  p_type      text,
  p_hora      text,
  p_base64    text DEFAULT NULL,
  p_nome      text DEFAULT NULL,
  p_quoted    text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.mensagens_geral
    (instancia, numero, mensagem, type, "horaLastMessage", base64, nome, quoted_id_mensagem, created_at)
  VALUES
    (p_instancia, p_numero, p_mensagem, p_type, p_hora, p_base64, p_nome, p_quoted, NOW());
END;
$$;
