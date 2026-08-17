/**
 * Módulo SAÚDE MENTAL — definição declarativa.
 *
 * É um "pacote" composto por três seções que sempre andam juntas:
 *   1. Comportamento e Emoção
 *   2. Fatores Ambientais
 *   3. Percepção sobre Saúde e Qualidade de Vida
 *
 * Este arquivo é a única fonte de verdade da estrutura do questionário: campos
 * persistidos, tipos, opções, condicionais e obrigatoriedade. O formulário, a
 * validação do backend e o motor analítico (`mental-health.ts`) são todos
 * derivados daqui — não replique listas de campos em outro lugar.
 *
 * Especificação: modulos_comportamento_ambientais_saude.md
 */

export type MentalHealthSectionKey =
  | 'comportamento_emocao'
  | 'fatores_ambientais'
  | 'percepcao_saude'

export interface MentalHealthSection {
  key: MentalHealthSectionKey
  title: string
  subtitle: string
}

export const MENTAL_HEALTH_SECTIONS: readonly MentalHealthSection[] = [
  {
    key: 'comportamento_emocao',
    title: 'Comportamento e Emoção',
    subtitle: 'Estresse, sintomas depressivos, indicadores de risco, substâncias e uso de tecnologia',
  },
  {
    key: 'fatores_ambientais',
    title: 'Fatores Ambientais',
    subtitle: 'Rede de apoio e vivências do último ano',
  },
  {
    key: 'percepcao_saude',
    title: 'Percepção sobre Saúde e Qualidade de Vida',
    subtitle: 'Autoavaliação de saúde e qualidade de vida em escala de 0 a 10',
  },
] as const

// ─── Widgets ─────────────────────────────────────────────────────────────────

export interface CheckboxOption {
  /** Nome da coluna booleana persistida. */
  field: string
  label: string
}

export interface EnumOption {
  value: number
  key: string
  label: string
}

/** Condicional de visibilidade: o bloco só aparece quando `field` vale `equals`. */
export interface VisibilityRule {
  field: string
  equals: boolean | number
}

interface QuestionBase {
  code: string
  section: MentalHealthSectionKey
  text: string
  /** Texto auxiliar exibido abaixo do enunciado. */
  hint?: string
  visibleWhen?: VisibilityRule
}

/**
 * Grupo de checkboxes. Cada opção é uma coluna booleana própria; checkbox
 * desmarcado grava `false`, nunca `null` (§2.1).
 *
 * `noneLabel` renderiza a opção "Nenhuma das anteriores", que é apenas UI e
 * força uma resposta explícita — exceto quando `noneField` está presente
 * ("Ninguém" da rede de apoio), aí a declaração de ausência é persistida.
 */
export interface CheckboxGroupQuestion extends QuestionBase {
  kind: 'checkbox_group'
  options: readonly CheckboxOption[]
  noneLabel: string
  /** Coluna booleana da opção "nenhum", quando ela tem significado próprio. */
  noneField?: string
  /** Campo de texto livre "Outro (qual?)" — o texto é o dado persistido (§2.3). */
  otherField?: { field: string; label: string; placeholder?: string }
  /** Quando true, o texto de "Outro" conta como item marcado do grupo. */
  otherCountsAsItem?: boolean
}

export interface BooleanQuestion extends QuestionBase {
  kind: 'boolean'
  field: string
  required: boolean
  yesLabel?: string
  noLabel?: string
}

export interface EnumQuestion extends QuestionBase {
  kind: 'enum'
  field: string
  required: boolean
  options: readonly EnumOption[]
}

export interface NumberQuestion extends QuestionBase {
  kind: 'number'
  field: string
  /** Obrigatório apenas enquanto visível (ver `visibleWhen`). */
  required: boolean
  min: number
  max?: number
}

export interface ScaleQuestion extends QuestionBase {
  kind: 'scale_0_10'
  field: string
  required: boolean
}

export interface TextQuestion extends QuestionBase {
  kind: 'text'
  field: string
  required: false
  maxLength: number
}

export type MentalHealthQuestion =
  | CheckboxGroupQuestion
  | BooleanQuestion
  | EnumQuestion
  | NumberQuestion
  | ScaleQuestion
  | TextQuestion

// ─── Grupos de campos reaproveitados pelo motor analítico ────────────────────

export const STRESS_SYMPTOM_OPTIONS: readonly CheckboxOption[] = [
  { field: 'stress_lack_control', label: 'Sensação de falta de controle sobre as coisas' },
  { field: 'stress_tiredness', label: 'Cansaço excessivo' },
  { field: 'stress_difficulty_relax', label: 'Dificuldade para relaxar' },
  { field: 'stress_accumulation_problems', label: 'Sensação de acúmulo de problemas' },
  { field: 'stress_procrastination', label: 'Procrastinação (adiar afazeres e compromissos; tarefas inacabadas)' },
  { field: 'stress_irritation', label: 'Irritação' },
  { field: 'stress_feeling_low_capacity', label: 'Sensação de pouca capacidade para lidar com os problemas' },
  { field: 'stress_insomnia', label: 'Insônia' },
  { field: 'stress_impairment_decision_making', label: 'Dificuldade de tomar decisões' },
] as const

export const STRESS_SOURCE_OPTIONS: readonly CheckboxOption[] = [
  { field: 'stress_source_work', label: 'Trabalho (tensão entre colegas e/ou chefia, sobrecarga/pressão)' },
  { field: 'stress_source_study', label: 'Estudos (entregas, prazos, sobrecarga)' },
  { field: 'stress_source_money', label: 'Dinheiro (dívidas, despesas altas, diminuição nos ganhos, apostas online)' },
  { field: 'stress_source_relationships', label: 'Relacionamentos (brigas, discussões, separações, falecimentos, solidão)' },
  { field: 'stress_source_health', label: 'Saúde (doenças crônicas, doença terminal, crise)' },
  { field: 'stress_source_technology', label: 'Tecnologia (uso excessivo, sobrecarga — redes sociais, e-mails, apps de comunicação e internet)' },
  { field: 'stress_source_violence', label: 'Violência urbana (assaltos, roubo e outros crimes)' },
  { field: 'stress_source_discrimination', label: 'Discriminação (preconceito contra minorias — mulheres, negros, LGBTQIAPN+, entre outros)' },
  { field: 'stress_source_politics', label: 'Clima político (divergências, discussões, preocupações)' },
  { field: 'stress_source_covid', label: 'Fatores externos: pandemias, mudanças climáticas' },
] as const

export const DEPRESSION_SYMPTOM_OPTIONS: readonly CheckboxOption[] = [
  { field: 'depression_symptoms_sadness', label: 'Tristeza' },
  { field: 'depression_symptoms_discouragement', label: 'Desânimo/Desmotivação' },
  { field: 'depression_symptoms_loss_of_interest', label: 'Perda de interesse/prazer' },
  { field: 'depression_symptoms_irritability', label: 'Irritabilidade' },
  { field: 'depression_symptoms_worthless', label: 'Sentiu-se sem valor/desvalorizado' },
  { field: 'depression_symptoms_useless', label: 'Sentiu-se inútil' },
  { field: 'depression_symptoms_alone', label: 'Sentiu-se abandonado/sozinho' },
  { field: 'depression_symptoms_guilty', label: 'Sentiu-se culpado' },
  { field: 'depression_symptoms_other', label: 'Outros' },
] as const

export const SUICIDE_SYMPTOM_OPTIONS: readonly CheckboxOption[] = [
  { field: 'suicide_symptoms_ideas', label: 'Ideias/pensamentos de se matar' },
  { field: 'suicide_symptoms_threats', label: 'Ameaças de se matar' },
  { field: 'suicide_symptoms_plan', label: 'Plano de acabar com a própria vida' },
  { field: 'suicide_symptoms_self_injury', label: 'Autoagressão/autolesão (por exemplo, se cortar)' },
  { field: 'suicide_symptoms_attempt', label: 'Tentativas de acabar com a própria vida' },
] as const

export const SUBSTANCE_USED_OPTIONS: readonly CheckboxOption[] = [
  { field: 'substance_used_antidepressant', label: 'Antidepressivo' },
  { field: 'substance_used_anxiolytic', label: 'Ansiolítico' },
  { field: 'substance_used_antipsychotic', label: 'Antipsicótico' },
  { field: 'substance_used_marihuana', label: 'Maconha' },
  { field: 'substance_used_cocaine', label: 'Cocaína' },
  { field: 'substance_used_crack', label: 'Crack' },
  { field: 'substance_used_ecstasy', label: 'Ecstasy' },
  { field: 'substance_used_inhalants', label: 'Inalantes' },
  { field: 'substance_used_lsd', label: 'LSD' },
  { field: 'substance_used_ayahuasca', label: 'Ayahuasca' },
  { field: 'substance_used_amphetamines', label: 'Anfetaminas' },
  { field: 'substance_used_weight_loss_medication', label: 'Medicamentos para perda de peso' },
] as const

export const SUPPORT_SOURCE_OPTIONS: readonly CheckboxOption[] = [
  { field: 'environmental_factors_support_family', label: 'Família' },
  { field: 'environmental_factors_support_spouse', label: 'Cônjuge/parceiro(a)' },
  { field: 'environmental_factors_support_friends', label: 'Amigos' },
  { field: 'environmental_factors_support_coworkers', label: 'Colegas de trabalho' },
] as const

export const LIFE_EVENT_OPTIONS: readonly CheckboxOption[] = [
  {
    field: 'environmental_factors_events_relationship_crisis',
    label: 'Dificuldades nas relações familiares e afetivas (separação, conflitos com cônjuge ou outros familiares, infidelidade ou relacionamentos abusivos)',
  },
  {
    field: 'environmental_factors_events_remarkable_events',
    label: 'Acontecimentos marcantes (novo relacionamento/casamento, nascimento de filhos)',
  },
  { field: 'environmental_factors_events_death_disease', label: 'Morte ou adoecimento de uma pessoa próxima e importante' },
  { field: 'environmental_factors_events_aggression', label: 'Envolvimento em situações de agressões físicas e/ou verbais' },
  { field: 'environmental_factors_events_loss', label: 'Perdas financeiras ou profissionais' },
  { field: 'environmental_factors_events_legal_issues', label: 'Problemas que envolvem processos legais' },
] as const

export const SUPPORT_OTHER_FIELD = 'environmental_factors_support_other'
export const SUPPORT_NOBODY_FIELD = 'environmental_factors_support_nobody'
export const LIFE_EVENT_OTHER_FIELD = 'environmental_factors_events_other'

export const INTERNET_FIELDS = [
  'technology_online_time',
  'technology_anxiety',
  'technology_social_media',
] as const

// ─── Escalas fechadas ────────────────────────────────────────────────────────

export const SMOKING_OPTIONS: readonly EnumOption[] = [
  { value: 1, key: 'not', label: 'Não sou fumante' },
  { value: 2, key: 'used', label: 'Sou ex-fumante (todos os cigarros fumados em sua vida inteira chegam a somar pelo menos 5 maços / 100 cigarros)' },
  { value: 3, key: 'yes_passive', label: 'Sou fumante passivo' },
  { value: 4, key: 'use', label: 'Sou fumante (pelo menos um cigarro por semana)' },
] as const

export const SMOKING_ACTIVE_VALUE = 4

export const DISASTER_TYPE_OPTIONS: readonly EnumOption[] = [
  { value: 1, key: 'floods', label: 'Inundações causadas pelo excesso de chuva' },
  { value: 2, key: 'landslides', label: 'Escorregamentos ou deslizamentos de terra (deslizamentos de barreira)' },
  { value: 3, key: 'hurricanes', label: 'Furacões, ciclones ou vendavais que destruíram moradias' },
  { value: 4, key: 'drought', label: 'Seca ou estiagem' },
  { value: 5, key: 'blackouts', label: 'Apagões na cidade com mais de um dia de duração' },
  { value: 6, key: 'wildfires', label: 'Queimadas' },
  { value: 7, key: 'earthquakes', label: 'Tremores de terra' },
  { value: 8, key: 'tsunami', label: 'Tsunami' },
  { value: 9, key: 'dam_failure', label: 'Queda de barragens' },
  { value: 10, key: 'chemical_spill', label: 'Derramamento de óleo ou outros produtos químicos na água da cidade' },
  { value: 11, key: 'not_applicable', label: 'Não se aplica' },
] as const

export const DISASTER_CONTACT_OPTIONS: readonly EnumOption[] = [
  { value: 1, key: 'life_risk_home_impacted', label: 'Corri risco de vida ou minha casa foi diretamente impactada' },
  { value: 2, key: 'close_people_impacted', label: 'Pessoas próximas a mim foram impactadas pelo desastre, mas estive em segurança durante o desastre' },
  { value: 3, key: 'commute_impacted', label: 'Meu deslocamento para o trabalho foi impactado pelo desastre, mas estive em segurança durante o desastre' },
  { value: 4, key: 'city_impacted_no_routine_problems', label: 'Minha cidade foi impactada, mas estive em segurança durante o desastre e não enfrentei problemas em minha rotina' },
  { value: 5, key: 'not_applicable', label: 'Não se aplica' },
] as const

export const INTENSITY_OPTIONS: readonly EnumOption[] = [
  { value: 1, key: 'nothing', label: 'Nada' },
  { value: 2, key: 'little', label: 'Pouco' },
  { value: 3, key: 'moderately', label: 'Moderadamente' },
  { value: 4, key: 'much', label: 'Muito' },
  { value: 5, key: 'extremely', label: 'Extremamente' },
] as const

// ─── Questionário ────────────────────────────────────────────────────────────

export const MENTAL_HEALTH_QUESTIONS: readonly MentalHealthQuestion[] = [
  {
    kind: 'checkbox_group',
    code: 'SM01',
    section: 'comportamento_emocao',
    text: 'Em relação às seguintes dificuldades, você vivenciou alguma das situações abaixo no último mês?',
    options: STRESS_SYMPTOM_OPTIONS,
    noneLabel: 'Nenhuma das anteriores',
  },
  {
    kind: 'checkbox_group',
    code: 'SM02',
    section: 'comportamento_emocao',
    text: 'Atualmente, você identifica alguma situação como possível fonte de estresse em sua rotina?',
    options: STRESS_SOURCE_OPTIONS,
    noneLabel: 'Não identifico nenhuma fonte de estresse',
  },
  {
    kind: 'boolean',
    code: 'SM03',
    section: 'comportamento_emocao',
    text: 'Você reside em uma cidade que foi exposta a algum desastre natural ou humano nos últimos dois anos?',
    hint: 'Exemplos são inundações causadas pelo excesso de chuva, furacões, ciclones, vendavais com impacto nas moradias, deslizamento de terra, tremores, apagões, queimadas, derramamento de óleo ou quedas de barragens.',
    field: 'exposed_natural_disaster',
    required: true,
  },
  {
    kind: 'enum',
    code: 'SM04',
    section: 'comportamento_emocao',
    text: 'Qual foi o desastre mais intenso para você nos últimos dois anos?',
    hint: 'Em caso de mais de um desastre em sua cidade, marque a opção que mais lhe impactou.',
    field: 'disaster_type',
    // 🔧 Obrigatório apenas enquanto visível: quem respondeu "Sim" à exposição
    // a desastres precisa detalhar qual foi; quem respondeu "Não" nem vê a
    // pergunta (visibleWhen cuida disso — ver isMentalHealthQuestionVisible e
    // a checagem de requiredness em validateMentalHealthAnswers).
    required: true,
    options: DISASTER_TYPE_OPTIONS,
    visibleWhen: { field: 'exposed_natural_disaster', equals: true },
  },
  {
    kind: 'enum',
    code: 'SM05',
    section: 'comportamento_emocao',
    text: 'Qual foi seu contato com o desastre que marcou como mais intenso?',
    field: 'disaster_contact',
    required: true,
    options: DISASTER_CONTACT_OPTIONS,
    visibleWhen: { field: 'exposed_natural_disaster', equals: true },
  },
  {
    kind: 'enum',
    code: 'SM06',
    section: 'comportamento_emocao',
    text: 'Após o desastre, você se sente mais vulnerável às mudanças climáticas ou desastres ambientais futuros?',
    field: 'disaster_vulnerability_feeling',
    required: true,
    options: INTENSITY_OPTIONS,
    visibleWhen: { field: 'exposed_natural_disaster', equals: true },
  },
  {
    kind: 'enum',
    code: 'SM07',
    section: 'comportamento_emocao',
    text: 'Após o desastre, você tem se preocupado mais com a segurança do seu lar ou local de trabalho?',
    field: 'disaster_safety_concern',
    required: true,
    options: INTENSITY_OPTIONS,
    visibleWhen: { field: 'exposed_natural_disaster', equals: true },
  },
  {
    kind: 'checkbox_group',
    code: 'SM08',
    section: 'comportamento_emocao',
    text: 'Em relação às duas últimas semanas, você apresentou algum dos sentimentos listados abaixo de maneira muito frequente (quase todos os dias)?',
    options: DEPRESSION_SYMPTOM_OPTIONS,
    noneLabel: 'Nenhuma das anteriores',
  },
  {
    kind: 'checkbox_group',
    code: 'SM09',
    section: 'comportamento_emocao',
    text: 'Nos últimos 30 dias, você apresentou algum dos sentimentos ou comportamentos listados abaixo?',
    options: SUICIDE_SYMPTOM_OPTIONS,
    noneLabel: 'Nenhum',
  },
  {
    kind: 'enum',
    code: 'SM10',
    section: 'comportamento_emocao',
    text: 'Você faz uso de cigarros, cigarrilhas, charutos, cachimbos, cigarros eletrônicos (vapes) e/ou similares?',
    field: 'substance_smoking',
    required: true,
    options: SMOKING_OPTIONS,
  },
  {
    kind: 'number',
    code: 'SM11',
    section: 'comportamento_emocao',
    text: 'Quantos cigarros você fuma por dia?',
    field: 'substance_cigarettes_per_day',
    required: false,
    min: 0,
    max: 200,
    visibleWhen: { field: 'substance_smoking', equals: SMOKING_ACTIVE_VALUE },
  },
  {
    kind: 'boolean',
    code: 'SM12',
    section: 'comportamento_emocao',
    text: 'Você consome bebidas alcoólicas?',
    field: 'substance_alcohol_use',
    required: true,
  },
  {
    kind: 'number',
    code: 'SM13',
    section: 'comportamento_emocao',
    text: 'Nos dias em que você consome bebidas alcoólicas, quantas doses você costuma ingerir, em média?',
    hint: 'Dose é igual a um copo de cerveja, uma taça de espumante ou vinho, ou uma dose de alguma bebida mais forte.',
    field: 'substance_drinking_doses',
    required: true,
    min: 1,
    max: 99,
    visibleWhen: { field: 'substance_alcohol_use', equals: true },
  },
  {
    kind: 'checkbox_group',
    code: 'SM14',
    section: 'comportamento_emocao',
    text: 'Você usou, nos últimos 30 dias, algumas das substâncias ou medicações listadas a seguir?',
    options: SUBSTANCE_USED_OPTIONS,
    noneLabel: 'Nenhuma das anteriores',
  },
  {
    kind: 'boolean',
    code: 'SM15',
    section: 'comportamento_emocao',
    text: 'Você sente que deveria diminuir o seu tempo on-line (redes sociais, e-mails, jogos, aplicativos)?',
    field: 'technology_online_time',
    required: true,
  },
  {
    kind: 'boolean',
    code: 'SM16',
    section: 'comportamento_emocao',
    text: 'Você se sente ansioso quando não verifica seu celular ou outro dispositivo (computador, tablet)?',
    field: 'technology_anxiety',
    required: true,
  },
  {
    kind: 'boolean',
    code: 'SM17',
    section: 'comportamento_emocao',
    text: 'Você se sente triste ou frustrado ao se comparar com outras pessoas nas redes sociais?',
    field: 'technology_social_media',
    required: true,
  },
  {
    kind: 'checkbox_group',
    code: 'SM18',
    section: 'fatores_ambientais',
    text: 'Com quem você pode contar quando necessita de apoio?',
    options: SUPPORT_SOURCE_OPTIONS,
    noneLabel: 'Ninguém',
    noneField: SUPPORT_NOBODY_FIELD,
    otherField: { field: SUPPORT_OTHER_FIELD, label: 'Outro (qual?)', placeholder: 'Ex.: terapeuta, líder religioso, vizinho' },
    otherCountsAsItem: true,
  },
  {
    kind: 'checkbox_group',
    code: 'SM19',
    section: 'fatores_ambientais',
    text: 'No último ano, você vivenciou alguma das situações a seguir?',
    options: LIFE_EVENT_OPTIONS,
    noneLabel: 'Nenhuma das anteriores',
    otherField: { field: LIFE_EVENT_OTHER_FIELD, label: 'Outro (qual?)', placeholder: 'Descreva brevemente' },
    otherCountsAsItem: true,
  },
  {
    kind: 'scale_0_10',
    code: 'SM20',
    section: 'percepcao_saude',
    text: 'No geral, como você avalia sua saúde?',
    field: 'health_score',
    required: true,
  },
  {
    kind: 'scale_0_10',
    code: 'SM21',
    section: 'percepcao_saude',
    text: 'No geral, como você avalia a sua qualidade de vida, considerando seu bem-estar físico, emocional, social e as condições do seu dia a dia?',
    field: 'life_quality_score',
    required: true,
  },
  {
    kind: 'text',
    code: 'SM22',
    section: 'percepcao_saude',
    text: 'Se desejar, utilize o espaço abaixo para compartilhar comentários, sugestões ou observações que considere importantes:',
    field: 'health_observations',
    required: false,
    maxLength: 1500,
  },
] as const

export const MENTAL_HEALTH_CODES: string[] = MENTAL_HEALTH_QUESTIONS.map((q) => q.code)

const SECTION_TITLE_BY_KEY: Record<MentalHealthSectionKey, string> = Object.fromEntries(
  MENTAL_HEALTH_SECTIONS.map((section) => [section.key, section.title]),
) as Record<MentalHealthSectionKey, string>

/**
 * Formato aceito pelo editor de perguntas do mapeamento (código + "domínio" +
 * enunciado). Aqui o domínio exibido é a seção do pacote.
 */
export const MENTAL_HEALTH_EDITABLE_QUESTIONS: ReadonlyArray<{ code: string; domain: string; text: string }> =
  MENTAL_HEALTH_QUESTIONS.map((question) => ({
    code: question.code,
    domain: SECTION_TITLE_BY_KEY[question.section],
    text: question.text,
  }))

export const MENTAL_HEALTH_SCALE_HEADER = {
  title: 'Dê uma nota de 0 a 10',
  instructionsTitle: 'Instruções de Preenchimento',
  instructions:
    'Quanto mais próximo de 0, pior a sua avaliação; quanto mais próximo de 10, melhor a sua avaliação.',
  anchors: [
    { value: 0, label: 'Muito ruim' },
    { value: 10, label: 'Excelente' },
  ],
} as const

// ─── Registro de campos (derivado das questões) ──────────────────────────────

export type MentalHealthFieldType = 'boolean' | 'integer' | 'text'

export interface MentalHealthFieldMeta {
  field: string
  type: MentalHealthFieldType
  label: string
  code: string
  section: MentalHealthSectionKey
  /** Só para `integer` vindo de enum/número/escala. */
  min?: number
  max?: number
  allowedValues?: number[]
}

function buildFieldRegistry(): MentalHealthFieldMeta[] {
  const registry: MentalHealthFieldMeta[] = []

  for (const question of MENTAL_HEALTH_QUESTIONS) {
    const base = { code: question.code, section: question.section }

    if (question.kind === 'checkbox_group') {
      for (const option of question.options) {
        registry.push({ ...base, field: option.field, type: 'boolean', label: option.label })
      }
      if (question.noneField) {
        registry.push({ ...base, field: question.noneField, type: 'boolean', label: question.noneLabel })
      }
      if (question.otherField) {
        registry.push({ ...base, field: question.otherField.field, type: 'text', label: question.otherField.label })
      }
      continue
    }

    if (question.kind === 'boolean') {
      registry.push({ ...base, field: question.field, type: 'boolean', label: question.text })
      continue
    }

    if (question.kind === 'enum') {
      registry.push({
        ...base,
        field: question.field,
        type: 'integer',
        label: question.text,
        allowedValues: question.options.map((o) => o.value),
      })
      continue
    }

    if (question.kind === 'number') {
      registry.push({ ...base, field: question.field, type: 'integer', label: question.text, min: question.min, max: question.max })
      continue
    }

    if (question.kind === 'scale_0_10') {
      registry.push({ ...base, field: question.field, type: 'integer', label: question.text, min: 0, max: 10 })
      continue
    }

    registry.push({ ...base, field: question.field, type: 'text', label: question.text })
  }

  return registry
}

export const MENTAL_HEALTH_FIELDS: readonly MentalHealthFieldMeta[] = buildFieldRegistry()

export const MENTAL_HEALTH_FIELD_BY_NAME: ReadonlyMap<string, MentalHealthFieldMeta> = new Map(
  MENTAL_HEALTH_FIELDS.map((meta) => [meta.field, meta]),
)

export const MENTAL_HEALTH_FIELD_NAMES: readonly string[] = MENTAL_HEALTH_FIELDS.map((meta) => meta.field)

/** Rótulo curto de cada campo — usado nos gráficos descritivos do dashboard. */
export const MENTAL_HEALTH_FIELD_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  MENTAL_HEALTH_FIELDS.map((meta) => [meta.field, meta.label]),
)

export const MENTAL_HEALTH_QUESTION_BY_CODE: ReadonlyMap<string, MentalHealthQuestion> = new Map(
  MENTAL_HEALTH_QUESTIONS.map((q) => [q.code, q]),
)

/**
 * Campos condicionais e o gatilho que os libera. Quando o gatilho não é
 * satisfeito, o valor é forçado a `null` na normalização — nada de resíduo do
 * último valor digitado (§2.4).
 */
export const MENTAL_HEALTH_CONDITIONAL_FIELDS: ReadonlyArray<{ field: string; rule: VisibilityRule }> =
  MENTAL_HEALTH_QUESTIONS
    .filter((q): q is Exclude<MentalHealthQuestion, CheckboxGroupQuestion> => q.kind !== 'checkbox_group' && !!q.visibleWhen)
    .map((q) => ({ field: q.field, rule: q.visibleWhen as VisibilityRule }))
