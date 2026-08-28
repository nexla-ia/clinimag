// Detecta se a resposta do webhook (n8n/Evolution) indica FALHA no envio e
// devolve um motivo curto e amigável — ou null se a resposta parece sucesso.
//
// A resposta de sucesso costuma vir como "instancia\nmensagem\nid_mensagem".
// Os erros podem vir:
//  - como texto começando com "ERRO" (nó de erro do n8n), ou
//  - como o JSON de erro do Evolution (ex: número que não existe no WhatsApp
//    vem com "exists": false; erros genéricos trazem "error"/"Bad Request"/
//    status 4xx-5xx).
// Ruído de INFRA do n8n — NÃO é falha de entrega. Ex.: o node "Respond to
// Webhook" estourar "Timeout waiting for lock SqliteWriteConnectionMutex" (lock
// do SQLite interno do n8n). A mensagem JÁ foi enviada pela Evolution num node
// anterior; só a resposta pro app tropeçou. Não deve virar aviso na plataforma.
export function isN8nInfraNoise(text) {
  return /SqliteWriteConnectionMutex|Timeout waiting for lock|database is locked|SQLITE_BUSY/i.test(text || '')
}

export function detectSendError(text) {
  const t = (text || '').trim()
  if (!t) return null
  // Erro interno do n8n (não de entrega) → trata como sucesso silencioso.
  if (isN8nInfraNoise(t)) return null
  if (/^ERRO/i.test(t)) return t.replace(/^ERRO[:\s-]*/i, '').trim() || 'falha no envio'
  // Evolution: número não existe no WhatsApp (o JSON vem escapado, então
  // aceita barras antes das aspas: exists":false / exists\":false / exists:false)
  if (/exists\\*"?\s*:\s*false/i.test(t)) return 'o número não existe no WhatsApp'
  // Erro genérico do Evolution / status HTTP de erro no corpo
  if (/error\\*"?\s*:/i.test(t) || /\bBad ?Request\b/i.test(t)
      || /status\\*"?\s*:\s*[45]\d\d/.test(t) || /statusCode\\*"?\s*:\s*[45]\d\d/.test(t)) {
    return 'o WhatsApp recusou o envio'
  }
  return null
}
