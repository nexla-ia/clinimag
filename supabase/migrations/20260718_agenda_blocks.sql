-- ==============================================================
-- Agenda — bloqueio de horário (ausência, almoço, férias...)
--
-- Marca um intervalo numa agenda como indisponível. Slots dentro do
-- intervalo aparecem bloqueados e não aceitam agendamento (nem clique,
-- nem arrastar). Ex: profissional vai faltar à tarde → bloqueia 13:00–18:00.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase (projeto NOVO, sbzwtnxx).
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.agenda_blocks (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  agenda_id  uuid        NOT NULL,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  reason     text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agenda_blocks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "agenda_blocks_all" ON public.agenda_blocks
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS agenda_blocks_idx
  ON public.agenda_blocks (instancia, agenda_id, starts_at);
