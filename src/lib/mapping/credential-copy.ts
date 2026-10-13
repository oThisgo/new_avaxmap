import { fieldLabel } from './column-locks'

/**
 * Frase possessiva usada na tela de login ("Insira <possessivo> para continuar").
 * Só existe para os campos de identidade reconhecidos (ver column-locks.ts) cujo
 * rótulo padrão ("Código/Matrícula") não soa natural dentro de uma frase — os
 * demais casos usam o rótulo genérico "credencial de acesso".
 */
const CREDENTIAL_FIELD_POSSESSIVE: Record<string, string> = {
  email: 'seu e-mail',
  cpf: 'seu CPF',
  employee_code: 'seu código de matrícula',
  full_name: 'seu nome completo',
}

export type CredentialCopy = {
  /** Frase completa do subtítulo, ex.: "Insira seu e-mail para continuar". */
  prompt: string
  /** Rótulo curto acima do campo, ex.: "E-mail". */
  label: string
  /** Placeholder do input, ex.: "Digite seu e-mail". */
  placeholder: string
}

/**
 * Deriva o texto da tela de login do colaborador a partir da coluna escolhida como
 * credencial de acesso na criação do mapeamento — em vez do genérico "Credencial",
 * mostra o nome real (e-mail, CPF, matrícula...) sempre que a coluna corresponde a
 * um campo padrão reconhecido; caso contrário, cai para um rótulo genérico com o
 * nome de exibição escolhido pelo cliente para a coluna.
 */
export function getCredentialCopy(
  columnMapping: Record<string, string>,
  credentialColumn: string | null,
  columnDisplayNames: Record<string, string>,
): CredentialCopy {
  if (!credentialColumn) {
    return {
      prompt: 'Insira sua credencial de acesso para continuar',
      label: 'Credencial',
      placeholder: 'Credencial de acesso',
    }
  }

  const matchedField = Object.entries(columnMapping).find(([, column]) => column === credentialColumn)?.[0]
  const possessive = matchedField ? CREDENTIAL_FIELD_POSSESSIVE[matchedField] : undefined

  if (matchedField && possessive) {
    return {
      prompt: `Insira ${possessive} para continuar`,
      label: fieldLabel(matchedField),
      placeholder: `Digite ${possessive}`,
    }
  }

  const customLabel = columnDisplayNames[credentialColumn] || credentialColumn
  return {
    prompt: `Insira sua credencial de acesso (${customLabel}) para continuar`,
    label: customLabel,
    placeholder: 'Digite sua credencial de acesso',
  }
}
