-- ==============================================================
-- Financeiro/Agenda — limpeza ao EXCLUIR um agendamento
-- Quando um agendamento é excluído (delete), remove o "a receber" ainda
-- PENDENTE que ele havia gerado no Financeiro (evita cobrança órfã).
-- Se o lançamento já estava PAGO, é mantido (o dinheiro entrou de fato).
-- Cobre exclusão pela tela e pela IA/n8n. Blindado.
--
-- Para usar: cole no SQL Editor do Supabase do projeto.
-- ==============================================================

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.fin_cleanup_on_appointment_delete()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM financial_transactions
   WHERE appointment_id = OLD.id
     AND status = 'pendente';
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS fin_cleanup_appt_del ON public.appointments;
CREATE TRIGGER fin_cleanup_appt_del
  AFTER DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fin_cleanup_on_appointment_delete();
