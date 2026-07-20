-- ==============================================================
-- Conversas — MOSTRAR a mensagem que o CLIENTE respondeu (citação recebida)
--
-- Quando o cliente arrasta uma mensagem nossa e responde citando ela, o
-- WhatsApp manda no webhook o "contextInfo": qual mensagem foi citada
-- (stanzaId) e um trechinho do conteúdo citado (quotedMessage).
--
-- Já temos quoted_id_mensagem (a referência) — usado hoje pras respostas
-- que NÓS enviamos. Falta só guardar também o TEXTO citado, pra conseguir
-- exibir o balãozinho de citação mesmo quando a mensagem original é antiga
-- e não está mais carregada na tela.
--
-- No n8n, no fluxo que INSERE a mensagem recebida em mensagens_geral,
-- preencher (quando vier contextInfo):
--   quoted_id_mensagem = data.message.extendedTextMessage.contextInfo.stanzaId
--   quoted_text        = trecho de contextInfo.quotedMessage
--                        (.conversation ou .extendedTextMessage.text ...)
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase (projeto NOVO, sbzwtnxx).
-- ==============================================================

ALTER TABLE public.mensagens_geral
  ADD COLUMN IF NOT EXISTS quoted_text text;
