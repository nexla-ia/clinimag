-- ==============================================================
-- FASE 0 (piloto) — RLS por tenant em public.saved_contacts
--
-- Prova o isolamento: quem chega COM crachá (token authenticated) só vê a
-- própria `instancia`. Quem chega como ANON continua vendo tudo — porque o
-- frontend atual ainda usa a anon key. Então esta migration NÃO muda o
-- comportamento do app hoje (todas as requisições dele são anon); só passa a
-- filtrar as requisições autenticadas (que hoje são só os testes do Claude).
--
-- Depois que o frontend passar a mandar o crachá, as requisições viram
-- authenticated → caem na regra de tenant → isolamento real. Por último a
-- gente remove a policy anon.
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor (produção sbzwtnxx).
-- ==============================================================

DROP POLICY IF EXISTS saved_contacts_all ON public.saved_contacts;

-- anon: continua aberto (frontend atual). SERÁ REMOVIDO no fim da migração.
DROP POLICY IF EXISTS saved_contacts_anon ON public.saved_contacts;
CREATE POLICY saved_contacts_anon ON public.saved_contacts
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- authenticated (com crachá): só a própria instancia (lida do claim do token).
DROP POLICY IF EXISTS saved_contacts_tenant ON public.saved_contacts;
CREATE POLICY saved_contacts_tenant ON public.saved_contacts
  FOR ALL TO authenticated
  USING      (instancia = (current_setting('request.jwt.claims', true)::jsonb ->> 'instancia'))
  WITH CHECK (instancia = (current_setting('request.jwt.claims', true)::jsonb ->> 'instancia'));

-- ── ROLLBACK (se algo travar, volta ao aberto): ──────────────────────────
--   DROP POLICY saved_contacts_anon    ON public.saved_contacts;
--   DROP POLICY saved_contacts_tenant  ON public.saved_contacts;
--   CREATE POLICY saved_contacts_all ON public.saved_contacts
--     FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
