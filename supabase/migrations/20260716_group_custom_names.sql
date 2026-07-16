-- ==============================================================
-- Grupos — nome personalizado por grupo
--
-- Alguns grupos chegam do WhatsApp sem nomegrupo e aparecem só com o
-- código (12036342...). Esta tabela guarda um apelido definido pela
-- clínica, que a tela usa no lugar do nome original quando existir.
-- Também serve pra renomear grupo que já tem nome.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase do projeto (o NOVO, sbzwtnxx).
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.group_custom_names (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  idgrupo    text        NOT NULL,
  nome       text        NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (instancia, idgrupo)
);

ALTER TABLE public.group_custom_names ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "group_custom_names_all" ON public.group_custom_names
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS group_custom_names_instancia_idx
  ON public.group_custom_names (instancia);
