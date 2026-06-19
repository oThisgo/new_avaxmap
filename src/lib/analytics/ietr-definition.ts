export type IetrDomain =
  | 'Demandas'
  | 'Controle'
  | 'Suporte'
  | 'Comunicação'
  | 'Papel'
  | 'Limites'
  | 'Ambiente'
  | 'Produtividade'

export interface IetrQuestionDefinition {
  code: string
  domain: IetrDomain
  text: string
  inverted: boolean
}

export const IETR_SCALE_OPTIONS = [
  'Nunca',
  'Raramente',
  'Às vezes',
  'Frequentemente',
  'Sempre',
] as const

export const IETR_QUESTIONS: IetrQuestionDefinition[] = [
  {
    code: 'TR01',
    domain: 'Demandas',
    text: 'O volume de trabalho no formato remoto é compatível com o tempo disponível',
    inverted: false,
  },
  {
    code: 'TR02',
    domain: 'Demandas',
    text: 'O ritmo de trabalho no formato remoto é adequado',
    inverted: false,
  },
  {
    code: 'TR03',
    domain: 'Controle',
    text: 'Tenho autonomia para organizar minha rotina de trabalho remoto',
    inverted: false,
  },
  {
    code: 'TR04',
    domain: 'Controle',
    text: 'Posso decidir como executar minhas atividades no trabalho remoto',
    inverted: false,
  },
  {
    code: 'TR05',
    domain: 'Suporte',
    text: 'Os recursos tecnológicos disponíveis são adequados para o trabalho remoto',
    inverted: false,
  },
  {
    code: 'TR06',
    domain: 'Suporte',
    text: 'Recebo o suporte necessário para realizar o trabalho remoto',
    inverted: false,
  },
  {
    code: 'TR07',
    domain: 'Comunicação',
    text: 'A comunicação com a equipe ocorre de forma adequada no trabalho remoto',
    inverted: false,
  },
  {
    code: 'TR08',
    domain: 'Comunicação',
    text: 'Há alinhamento suficiente para a execução das atividades',
    inverted: false,
  },
  {
    code: 'TR09',
    domain: 'Papel',
    text: 'Tenho clareza sobre minhas responsabilidades no trabalho remoto',
    inverted: false,
  },
  {
    code: 'TR10',
    domain: 'Papel',
    text: 'As expectativas em relação ao meu trabalho estão definidas',
    inverted: false,
  },
  {
    code: 'TR11',
    domain: 'Limites',
    text: 'A jornada de trabalho remoto ocorre dentro do horário previsto',
    inverted: false,
  },
  {
    code: 'TR12',
    domain: 'Limites',
    text: 'Há separação entre o tempo de trabalho e o tempo pessoal',
    inverted: false,
  },
  {
    code: 'TR13',
    domain: 'Ambiente',
    text: 'O ambiente em que realizo o trabalho remoto é adequado',
    inverted: false,
  },
  {
    code: 'TR14',
    domain: 'Ambiente',
    text: 'O ambiente doméstico apresenta interferências durante o trabalho',
    inverted: true,
  },
  {
    code: 'TR15',
    domain: 'Produtividade',
    text: 'O trabalho remoto permite a realização das atividades conforme esperado',
    inverted: false,
  },
  {
    code: 'TR16',
    domain: 'Produtividade',
    text: 'O trabalho remoto permite manter a concentração nas tarefas',
    inverted: false,
  },
]

export const IETR_DOMAIN_WEIGHTS: Record<IetrDomain, number> = {
  Demandas: 2.0,
  Controle: 1.5,
  Suporte: 1.5,
  Comunicação: 1.5,
  Papel: 1.0,
  Limites: 2.0,
  Ambiente: 1.0,
  Produtividade: 2.0,
}

export const IETR_INVERTED_CODES = new Set(
  IETR_QUESTIONS.filter((q) => q.inverted).map((q) => q.code),
)

export const IETR_CODES = IETR_QUESTIONS.map((q) => q.code)
