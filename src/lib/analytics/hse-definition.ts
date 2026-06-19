export interface HseQuestionDefinition {
  code: string
  domain:
    | 'Demandas'
    | 'Controle'
    | 'Apoio da Liderança'
    | 'Apoio dos Colegas'
    | 'Relacionamentos'
    | 'Cargo'
    | 'Comunicação e Mudanças'
  text: string
}

export const HSE_SCALE_OPTIONS = [
  'Nunca',
  'Raramente',
  'Às vezes',
  'Frequentemente',
  'Sempre',
] as const

export const HSE_QUESTIONS: HseQuestionDefinition[] = [
  { code: 'Q01', domain: 'Cargo', text: 'Tenho clareza sobre o que se espera de mim no trabalho' },
  { code: 'Q02', domain: 'Controle', text: 'Posso decidir quando fazer uma pausa' },
  { code: 'Q03', domain: 'Demandas', text: 'As exigências de trabalho feitas por colegas e liderança direta são difíceis de combinar' },
  { code: 'Q04', domain: 'Cargo', text: 'Eu sei como fazer o meu trabalho' },
  { code: 'Q05', domain: 'Relacionamentos', text: 'Falam ou se comportam comigo de forma ríspida ou desrespeitosa' },
  { code: 'Q06', domain: 'Demandas', text: 'Os prazos definidos para minhas atividades são difíceis de serem cumpridos' },
  { code: 'Q07', domain: 'Apoio dos Colegas', text: 'Quando o trabalho se torna difícil, posso contar com a ajuda dos meus colegas' },
  { code: 'Q08', domain: 'Apoio da Liderança', text: 'Recebo informações e suporte que me ajudam no trabalho que eu faço' },
  { code: 'Q09', domain: 'Demandas', text: 'Meu trabalho exige que eu trabalhe em um ritmo muito intenso' },
  { code: 'Q10', domain: 'Controle', text: 'Consideram a minha opinião sobre o ritmo em que realizo meu trabalho' },
  { code: 'Q11', domain: 'Cargo', text: 'Estão claras as minhas tarefas e responsabilidades' },
  { code: 'Q12', domain: 'Demandas', text: 'Eu não faço algumas tarefas porque tenho muita coisa para fazer' },
  { code: 'Q13', domain: 'Cargo', text: 'Os objetivos e metas da minha área são claros para mim' },
  { code: 'Q14', domain: 'Relacionamentos', text: 'Existem conflitos entre os colegas' },
  { code: 'Q15', domain: 'Controle', text: 'Tenho liberdade de escolha de como fazer meu trabalho' },
  { code: 'Q16', domain: 'Demandas', text: 'Não tenho possibilidade de fazer pausas suficientes' },
  { code: 'Q17', domain: 'Cargo', text: 'Eu vejo como o meu trabalho contribui com os objetivos da empresa' },
  { code: 'Q18', domain: 'Demandas', text: 'Sinto-me pressionado a trabalhar fora do meu horário de trabalho' },
  { code: 'Q19', domain: 'Controle', text: 'Tenho liberdade para decidir o que fazer no meu trabalho' },
  { code: 'Q20', domain: 'Demandas', text: 'Tenho que fazer meu trabalho com muita rapidez' },
  { code: 'Q21', domain: 'Relacionamentos', text: 'Sinto que sou perseguido no trabalho' },
  { code: 'Q22', domain: 'Demandas', text: 'Na prática, é difícil ou impossível fazer pequenas pausas durante o trabalho' },
  { code: 'Q23', domain: 'Apoio da Liderança', text: 'Posso confiar em minha liderança quando eu tiver problemas no trabalho' },
  { code: 'Q24', domain: 'Apoio dos Colegas', text: 'Meus colegas me ajudam e me dão apoio quando eu preciso' },
  { code: 'Q25', domain: 'Controle', text: 'Minhas sugestões são consideradas sobre como fazer meu trabalho' },
  { code: 'Q26', domain: 'Comunicação e Mudanças', text: 'Tenho oportunidades para pedir explicações à minha liderança sobre as mudanças relacionadas ao meu trabalho' },
  { code: 'Q27', domain: 'Apoio dos Colegas', text: 'No trabalho os meus colegas demonstram o respeito que mereço' },
  { code: 'Q28', domain: 'Comunicação e Mudanças', text: 'As pessoas são sempre consultadas sobre as mudanças no trabalho' },
  { code: 'Q29', domain: 'Apoio da Liderança', text: 'Quando algo no trabalho me perturba ou irrita posso falar com minha liderança' },
  { code: 'Q30', domain: 'Controle', text: 'O meu horário de trabalho pode ser flexível' },
  { code: 'Q31', domain: 'Apoio dos Colegas', text: 'Os meus colegas estão disponíveis para escutar os meus problemas de trabalho' },
  { code: 'Q32', domain: 'Comunicação e Mudanças', text: 'Quando há mudanças, faço o meu trabalho com a mesma dedicação' },
  { code: 'Q33', domain: 'Apoio da Liderança', text: 'Tenho suportado trabalhos emocionalmente exigentes' },
  { code: 'Q34', domain: 'Relacionamentos', text: 'As relações no trabalho são tensas' },
  { code: 'Q35', domain: 'Apoio da Liderança', text: 'Minha liderança me incentiva no trabalho' },
]

export const HSE_CODES = HSE_QUESTIONS.map((q) => q.code)
