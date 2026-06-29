-- ==============================================================
-- CRM — criação automática de lead (opção A: todo número novo)
-- Quando chega uma mensagem individual (não-grupo) de um número que
-- ainda não tem lead no CRM, cria o lead automaticamente na primeira
-- etapa do funil principal, com a origem detectada.
--
-- Não duplica (UNIQUE instancia, phone + ON CONFLICT).
-- Não cria se o CRM ainda não foi inicializado (sem funil).
-- Para limpar ruído, o lead pode ser removido na tela do CRM (botão Remover).
--
-- Para usar: cole no SQL Editor do Supabase do projeto.
-- ==============================================================

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.crm_autocreate_on_message()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_phone  text;
  v_funnel uuid;
  v_stage  uuid;
  v_origem text;
  v_nome   text;
BEGIN
  -- Só mensagens individuais com número válido (ignora grupos)
  IF NEW.idgrupo IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.numero IS NULL OR NEW.numero LIKE '%@g.us' THEN RETURN NEW; END IF;

  v_phone := regexp_replace(NEW.numero, '[^0-9]', '', 'g');
  IF length(v_phone) < 8 THEN RETURN NEW; END IF;

  -- Já existe lead pra esse número? Sai sem fazer nada (barato — usa o índice UNIQUE).
  IF EXISTS (
    SELECT 1 FROM public.crm_contacts
    WHERE instancia = NEW.instancia AND phone = v_phone
  ) THEN
    RETURN NEW;
  END IF;

  -- Funil principal da instância (menor posição). Se não houver, CRM não foi
  -- inicializado ainda → não cria nada.
  SELECT id INTO v_funnel
  FROM public.crm_funnels
  WHERE instancia = NEW.instancia
  ORDER BY posicao ASC, created_at ASC
  LIMIT 1;
  IF v_funnel IS NULL THEN RETURN NEW; END IF;

  -- Primeira etapa do funil
  SELECT id INTO v_stage
  FROM public.crm_stages
  WHERE funil_id = v_funnel
  ORDER BY posicao ASC
  LIMIT 1;

  -- Nome e origem: aproveita o cadastro do paciente se existir
  SELECT nome, origem INTO v_nome, v_origem
  FROM public.saved_contacts
  WHERE instancia = NEW.instancia
    AND regexp_replace(numero, '[^0-9]', '', 'g') = v_phone
  LIMIT 1;

  v_nome := COALESCE(v_nome, NULLIF(NEW.nome, ''));
  IF v_origem IS NULL THEN
    v_origem := CASE WHEN lower(COALESCE(NEW.aplicativo, 'whatsapp')) = 'instagram'
                     THEN 'Instagram' ELSE 'WhatsApp' END;
  END IF;

  INSERT INTO public.crm_contacts
    (instancia, phone, nome, origem, stage_id, funil_id, temperatura, data_entrada_etapa)
  VALUES
    (NEW.instancia, v_phone, v_nome, v_origem, v_stage, v_funnel, 'frio', now())
  ON CONFLICT (instancia, phone) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_autocreate_msg ON public.mensagens_geral;
CREATE TRIGGER crm_autocreate_msg
  AFTER INSERT ON public.mensagens_geral
  FOR EACH ROW EXECUTE FUNCTION public.crm_autocreate_on_message();
