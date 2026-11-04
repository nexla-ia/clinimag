// Busca por telefone tolerante a formatação e ao 9º dígito do celular BR.
// "65 9911-8837" acha quem está salvo como 5565999118837 e vice-versa.

// Variantes de dígitos a procurar (a digitada + com/sem o 9, com ou sem o 55).
export function phoneSearchVariants(query) {
  const d = String(query || '').replace(/\D/g, '')
  const v = new Set(d ? [d] : [])
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  const pre = local === d ? '' : '55'
  if (local.length === 10) v.add(pre + local.slice(0, 2) + '9' + local.slice(2))            // sem 9 → com 9
  if (local.length === 11 && local[2] === '9') v.add(pre + local.slice(0, 2) + local.slice(3)) // com 9 → sem 9
  return [...v]
}

// true se o telefone casa com alguma variante (pré-calcule as variantes fora do loop).
export function phoneMatches(phone, variants) {
  if (!variants || !variants.length) return false
  const digits = String(phone || '').replace(/\D/g, '')
  return variants.some(v => digits.includes(v))
}
