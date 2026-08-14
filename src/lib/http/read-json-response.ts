/**
 * Leitura de resposta de API que não confunde "a rede caiu" com "a resposta não
 * era JSON".
 *
 * O padrão `const data = await res.json()` dentro do mesmo `try` do `fetch` faz
 * as duas falhas caírem no mesmo `catch`, e a tela reporta "erro de conexão"
 * mesmo quando o servidor respondeu — só que com HTML. É exatamente o que
 * acontece quando existe um proxy reverso, load balancer ou WAF na frente da
 * aplicação: 413 (corpo grande demais), 403 (WAF bloqueou o conteúdo), 502/504
 * (backend fora do ar ou lento) devolvem páginas HTML, não JSON. O diagnóstico
 * fica impossível pela tela, porque o motivo real nunca chega ao usuário.
 *
 * Aqui a resposta é lida como texto primeiro; o status HTTP sempre aparece na
 * mensagem quando o corpo não é JSON.
 */

export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/** Pistas por status para os erros que só aparecem atrás de proxy/WAF. */
function hintForStatus(status: number): string {
  if (status === 413) return 'O conteúdo enviado passou do limite de tamanho aceito pelo servidor web (proxy reverso/load balancer).'
  if (status === 403) return 'A requisição foi bloqueada antes de chegar à aplicação — típico de WAF inspecionando o corpo do envio.'
  if (status === 502 || status === 503) return 'A aplicação não respondeu ao servidor web. Verifique se o contêiner está de pé.'
  if (status === 504) return 'O servidor web desistiu de esperar a resposta da aplicação (timeout).'
  return 'O servidor respondeu em um formato inesperado.'
}

/**
 * @param fallbackMessage mensagem exibida quando a API respondeu erro em JSON
 *   mas sem campo `error`.
 */
export async function readJsonResponse<T = Record<string, unknown>>(
  res: Response,
  fallbackMessage: string,
): Promise<JsonResult<T>> {
  const rawBody = await res.text()

  let parsed: unknown = null
  if (rawBody.trim()) {
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      parsed = null
    }
  }

  const isJson = parsed !== null && typeof parsed === 'object'

  if (!isJson) {
    return {
      ok: false,
      error: `${fallbackMessage} (HTTP ${res.status}) — ${hintForStatus(res.status)}`,
    }
  }

  if (!res.ok) {
    const apiError = (parsed as { error?: unknown }).error
    return {
      ok: false,
      error: typeof apiError === 'string' && apiError.trim() ? apiError : `${fallbackMessage} (HTTP ${res.status})`,
    }
  }

  return { ok: true, data: parsed as T }
}
