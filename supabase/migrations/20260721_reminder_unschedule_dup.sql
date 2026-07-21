-- ==============================================================
-- Lembrete duplicado — remove o cron job SOBRANDO
--
-- CONFIRMADO em 21/07 (SELECT ... FROM cron.job): existiam DOIS jobs do
-- pg_cron chamando public.process_appointment_reminders():
--   jobid 1 | */5  * * * * | process-appointment-reminders   <- sobrando
--   jobid 2 | */15 * * * * | appointment-reminders           <- oficial (repo)
-- Nos minutos :00 :15 :30 :45 os dois disparavam juntos -> lembrete em dobro.
--
-- Mantém o 'appointment-reminders' (é o que o 20260717_schedule_reminders_cron
-- recria) e remove o 'process-appointment-reminders'.
--
-- OBS: a trava (20260721_reminder_no_dup.sql) já impede o envio em dobro mesmo
-- com dois jobs; isto aqui é a limpeza pra não rodar a função à toa a cada 5min.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase (projeto NOVO, sbzwtnxx).
-- ==============================================================

DO $$
BEGIN
  PERFORM cron.unschedule('process-appointment-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL; -- já não existia
END $$;

-- Confira o resultado (deve sobrar só o 'appointment-reminders' */15):
--   SELECT jobid, schedule, jobname FROM cron.job;
