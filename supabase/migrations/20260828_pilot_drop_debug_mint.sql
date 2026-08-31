-- ==============================================================
-- FASE 0 — remover a função de debug temporária
--
-- O smoke test/piloto foi validado e o login real (login_session) já está
-- provado. A _pilot_debug_mint emitia crachá de qualquer instancia (com o
-- PIN) — depois que saved_contacts passou a isolar por tenant, isso virou um
-- furo. Removendo agora. Seguro rodar mais de uma vez.
-- Cole no SQL Editor (produção sbzwtnxx).
-- ==============================================================

DROP FUNCTION IF EXISTS public._pilot_debug_mint(text, text);
