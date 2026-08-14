/**
 * Contextualização da escala de frequência de 5 pontos, compartilhada pelos
 * módulos que perguntam "com que frequência isso acontece no seu trabalho"
 * (Condições psicossociais no trabalho e Trabalho remoto).
 *
 * O texto fica aqui, junto das definições dos instrumentos, e não dentro do
 * componente de formulário: é enunciado do instrumento, não estilo de tela.
 */

export const FREQUENCY_SCALE_INSTRUCTIONS =
  'Responda as questões a seguir assinalando o quão frequente essas situações acontecem no seu contexto de trabalho. '
  + 'Considere os últimos 6 meses para responder as questões. Caso esteja há menos de 6 meses na empresa, '
  + 'considerar a partir do momento em que você entrou.'

export const FREQUENCY_SCALE_TITLE = 'Escala de Frequência'

export const FREQUENCY_SCALE_DESCRIPTIONS: ReadonlyArray<{ option: string; description: string }> = [
  { option: 'Nunca', description: 'A situação ou comportamento nunca ocorre.' },
  { option: 'Raramente', description: 'A situação ou comportamento ocorre em poucas ocasiões, sendo muito incomum.' },
  { option: 'Às vezes', description: 'A situação ou comportamento ocorre com alguma frequência, mas não é predominante.' },
  { option: 'Frequentemente', description: 'A situação ou comportamento ocorre na maioria das vezes, sendo comum.' },
  { option: 'Sempre', description: 'A situação ou comportamento ocorre em todas as ocasiões, sendo constante.' },
] as const
