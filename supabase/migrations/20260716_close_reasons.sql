-- ==============================================================
-- Conversas — motivos de encerramento personalizados por empresa
--
-- A tela "Finalizar conversa" tem motivos fixos (Agendado, Resolvido,
-- Encaminhado, Paciente não respondeu, Desistiu). Esta tabela guarda
-- motivos EXTRAS que cada clínica cria. Os fixos continuam no código;
-- estes aparecem junto, depois deles.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase (projeto NOVO, sbzwtnxx).
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.conversation_close_reasons (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  value      text        NOT NULL,          -- slug estável (ex: "orcamento_enviado")
  label      text        NOT NULL,          -- texto exibido
  color      text        DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now(),
  UNIQUE (instancia, value)
);

ALTER TABLE public.conversation_close_reasons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "close_reasons_all" ON public.conversation_close_reasons
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS close_reasons_instancia_idx
  ON public.conversation_close_reasons (instancia);
