-- ==============================================================
-- Financeiro — desconto e tarifa no lançamento
-- Guarda o desconto (ex: desconto dado ao paciente) e a tarifa (ex: taxa
-- de cartão/banco) de cada lançamento. O `valor` do lançamento passa a ser
-- o LÍQUIDO (bruto − desconto − tarifa), então relatórios/totais já refletem.
-- O bruto é reconstruído na edição = valor + desconto + tarifa.
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase do projeto.
-- ==============================================================

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS desconto numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa   numeric DEFAULT 0;

-- Garante que lançamentos antigos fiquem com 0 (não nulo) pra somar sem erro.
UPDATE public.financial_transactions SET desconto = 0 WHERE desconto IS NULL;
UPDATE public.financial_transactions SET tarifa   = 0 WHERE tarifa   IS NULL;
