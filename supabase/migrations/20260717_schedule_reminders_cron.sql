-- ==============================================================
-- Agendador do lembrete automático (pg_cron)
--
-- DIAGNÓSTICO: process_appointment_reminders() nunca rodou neste projeto
-- (0 de 292 agendamentos da Avivar tinham reminder_sent_at). Ou seja, a
-- função existe mas ninguém a chamava de tempos em tempos. Este arquivo
-- agenda ela pra rodar a cada 15 minutos.
--
-- Precisa das extensões pg_cron e pg_net habilitadas. No Supabase:
--   Dashboard → Database → Extensions → habilite "pg_cron" e "pg_net".
-- Se o CREATE EXTENSION abaixo der erro de permissão, habilite pela UI e
-- rode de novo só a parte do cron.schedule.
--
-- ALTERNATIVA (se preferir usar o n8n que vocês já têm): um nó Schedule
-- a cada 15 min → HTTP POST para
--   https://sbzwtnxxlopeliqlqfhp.supabase.co/rest/v1/rpc/process_appointment_reminders
--   headers: apikey + Authorization: Bearer <SERVICE_ROLE_KEY>
-- Nesse caso NÃO precisa deste arquivo.
--
-- Seguro rodar mais de uma vez.
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior com o mesmo nome (evita duplicar)
DO $$
BEGIN
  PERFORM cron.unschedule('appointment-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL; -- não existia ainda
END $$;

-- Roda a cada 15 minutos
SELECT cron.schedule(
  'appointment-reminders',
  '*/15 * * * *',
  $$ SELECT public.process_appointment_reminders(); $$
);
