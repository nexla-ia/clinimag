-- ==============================================================
-- CRM — backfill de leads a partir das conversas existentes
-- Cria um lead pra cada contato (WhatsApp, individual) que já mandou
-- mensagem mas ainda não tem lead no CRM. Coloca na primeira etapa do
-- funil principal de cada instância, com origem/nome quando existir.
--
-- Idempotente: não duplica (checa crm_contacts + ON CONFLICT).
-- Rode DEPOIS de re-aplicar o trigger crm_autocreate_on_message.
-- ==============================================================

SET search_path TO public;

WITH primary_funnel AS (
  SELECT DISTINCT ON (instancia) instancia, id AS funil_id
  FROM crm_funnels
  ORDER BY instancia, posicao, created_at
),
first_stage AS (
  SELECT DISTINCT ON (s.funil_id) s.funil_id, s.id AS stage_id
  FROM crm_stages s
  JOIN primary_funnel pf ON pf.funil_id = s.funil_id
  ORDER BY s.funil_id, s.posicao
),
contatos AS (
  SELECT DISTINCT ON (m.instancia, regexp_replace(m.numero, '[^0-9]', '', 'g'))
    m.instancia,
    regexp_replace(m.numero, '[^0-9]', '', 'g') AS phone,
    NULLIF(m.nome, '')                          AS nome_msg,
    lower(COALESCE(m.aplicativo, 'whatsapp'))   AS canal
  FROM mensagens_geral m
  WHERE m.idgrupo IS NULL
    AND m.numero IS NOT NULL
    AND m.numero NOT LIKE '%@g.us'
    AND length(regexp_replace(m.numero, '[^0-9]', '', 'g')) >= 8
    AND (m.aplicativo = 'whatsapp' OR m.aplicativo IS NULL)
  ORDER BY m.instancia, regexp_replace(m.numero, '[^0-9]', '', 'g'), m.id DESC
)
INSERT INTO crm_contacts
  (instancia, phone, nome, origem, stage_id, funil_id, temperatura, data_entrada_etapa)
SELECT
  c.instancia,
  c.phone,
  COALESCE(sc.nome, c.nome_msg),
  COALESCE(sc.referral_source, CASE WHEN c.canal = 'instagram' THEN 'Instagram' ELSE 'WhatsApp' END),
  fs.stage_id,
  pf.funil_id,
  'frio',
  now()
FROM contatos c
JOIN primary_funnel pf ON pf.instancia = c.instancia
JOIN first_stage   fs ON fs.funil_id  = pf.funil_id
LEFT JOIN saved_contacts sc
       ON sc.instancia = c.instancia
      AND regexp_replace(sc.numero, '[^0-9]', '', 'g') = c.phone
WHERE NOT EXISTS (
  SELECT 1 FROM crm_contacts x
  WHERE x.instancia = c.instancia AND x.phone = c.phone
)
ON CONFLICT (instancia, phone) DO NOTHING;
