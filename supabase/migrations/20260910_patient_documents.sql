-- Impressos da ficha do paciente (receituário, solicitação de exames, atestado,
-- declaração, outros). O médico escreve, imprime pra assinar/carimbar, e fica
-- salvo no histórico do paciente.
CREATE TABLE IF NOT EXISTS public.patient_documents (
  id                 uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instancia          text NOT NULL,
  contact_id         uuid REFERENCES public.saved_contacts(id) ON DELETE CASCADE,
  tipo               text NOT NULL,   -- receituario | exames | atestado | declaracao | outros
  titulo             text,
  corpo              text,
  professional_name  text,
  created_by         text,
  created_at         timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS patient_documents_contact_idx
  ON public.patient_documents (instancia, contact_id);

ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_patient_documents"
    ON public.patient_documents FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
