// Regra única de "esse número é brasileiro?" — mesma usada nas Conversas.
//
// Celular BR sem o 55 tem 11 dígitos = DDD + 9 + 8 dígitos (o 3º é sempre 9).
// Número ESTRANGEIRO também pode ter 11 dígitos (EUA 1+10, Bolívia 591+8,
// Bélgica 32+9...) e antes ganhava "55" na frente: virava outro número, a
// conversa abria vazia e o lembrete/resposta ia pro número errado.

// 11 dígitos sem 9 na 3ª posição → estrangeiro (não é DDD + 9xxxx-xxxx)
export function isForeign11(d) { return d.length === 11 && d[2] !== '9' }

// Dígitos canônicos: BR com 55 e SEM o 9 extra; estrangeiro fica como veio.
// Também desfaz o "55" + estrangeiro que foi gravado por engano antes.
export function normalizePhoneDigits(raw) {
  let d = String(raw || '').replace(/@.*/, '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 13 && d.startsWith('55') && d[4] !== '9' && isForeign11(d.slice(2))) d = d.slice(2)
  if ((d.length === 11 && !isForeign11(d)) || d.length === 10) d = '55' + d
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') d = '55' + d.slice(2, 4) + d.slice(5)
  return d
}
