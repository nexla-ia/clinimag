-- ============================================================================
-- CRM: lead criado com o nome da CLÍNICA quando a 1ª mensagem é da clínica
-- ----------------------------------------------------------------------------
-- Caso (lucaszarro, 27/10): a clínica mandou a 1ª mensagem pra Eliete. O gatilho
-- crm_autocreate_on_message criou o lead usando NEW.nome — que, numa mensagem
-- da clínica (type 'atendente'/'ia'), é o nome de PERFIL da clínica
-- ("Consultório Dr Lucas Zarro"). Quando a Eliete respondeu, o lead já existia
-- e o nome ficou errado.
--
-- Agora:
--  • só usa NEW.nome se a mensagem é do CLIENTE (type 'Cliente');
--  • se o lead já existe SEM nome e chega mensagem do cliente com nome,
--    preenche o nome (barato: usa o índice único instancia+phone);
--  • limpeza: leads cujo nome é igual ao nome de uma mensagem da CLÍNICA pro
--    mesmo número passam a ter o nome do cliente (última msg dele) ou NULL.
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase (sbzwtnxx).
-- ============================================================================

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.crm_autocreate_on_message()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_phone   text;
  v_funnel  uuid;
  v_stage   uuid;
  v_origem  text;
  v_nome    text;
  v_cliente boolean;
BEGIN
  -- Só mensagens individuais com número válido (ignora grupos)
  IF NEW.idgrupo IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.numero IS NULL OR NEW.numero LIKE '%@g.us' THEN RETURN NEW; END IF;

  v_phone := regexp_replace(NEW.numero, '[^0-9]', '', 'g');
  IF length(v_phone) < 8 THEN RETURN NEW; END IF;

  -- Mensagem do CLIENTE? (as da clínica vêm como 'atendente'/'ia' e trazem o
  -- nome de perfil da clínica em NEW.nome — não serve como nome do lead)
  v_cliente := lower(COALESCE(NEW.type, '')) = 'cliente';

  -- Já existe lead pra esse número? Só completa o nome, se faltar.
  IF EXISTS (
    SELECT 1 FROM public.crm_contacts
    WHERE instancia = NEW.instancia AND phone = v_phone
  ) THEN
    IF v_cliente AND NULLIF(btrim(NEW.nome), '') IS NOT NULL THEN
      UPDATE public.crm_contacts
         SET nome = btrim(NEW.nome)
       WHERE instancia = NEW.instancia AND phone = v_phone
         AND NULLIF(btrim(nome), '') IS NULL;
    END IF;
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

  -- Nome e origem: aproveita o cadastro do paciente se existir.
  SELECT nome, referral_source INTO v_nome, v_origem
  FROM public.saved_contacts
  WHERE instancia = NEW.instancia
    AND regexp_replace(numero, '[^0-9]', '', 'g') = v_phone
  LIMIT 1;

  IF v_cliente THEN
    v_nome := COALESCE(v_nome, NULLIF(btrim(NEW.nome), ''));
  END IF;
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

-- Blindagem: a criação de lead é acessória e NUNCA pode bloquear a gravação
-- da mensagem. Qualquer erro aqui é ignorado e a mensagem entra normalmente.
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Limpeza dos leads já criados com o nome da clínica (últimos 90 dias):
-- nome = nome de uma mensagem DA CLÍNICA pro mesmo número → troca pelo nome da
-- última mensagem do cliente (ou NULL, e o board mostra o nome salvo/número).
UPDATE public.crm_contacts c
   SET nome = (
     SELECT NULLIF(btrim(m2.nome), '')
       FROM public.mensagens_geral m2
      WHERE m2.instancia = c.instancia
        AND m2.numero = c.phone || '@s.whatsapp.net'
        AND lower(COALESCE(m2.type, '')) = 'cliente'
        AND NULLIF(btrim(m2.nome), '') IS NOT NULL
      ORDER BY m2.created_at DESC
      LIMIT 1
   )
 WHERE c.created_at > now() - interval '90 days'
   AND NULLIF(btrim(c.nome), '') IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.mensagens_geral m
      WHERE m.instancia = c.instancia
        AND m.numero = c.phone || '@s.whatsapp.net'
        AND lower(COALESCE(m.type, '')) IN ('atendente', 'ia')
        AND btrim(m.nome) = btrim(c.nome)
   );
