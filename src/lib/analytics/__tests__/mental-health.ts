/**
 * Casos de conferência do módulo Saúde Mental (§9.1 e §9.2 da especificação).
 * Rodar com: npx tsx src/lib/analytics/__tests__/mental-health.ts
 */
import {
  calculateMentalHealth,
  normalizeMentalHealthAnswers,
  validateMentalHealthAnswers,
  type MentalHealthAnswers,
} from '../mental-health'

let failures = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : '')
  }
}

function near(actual: number | null, expected: number, tolerance = 0.005): boolean {
  return actual !== null && Math.abs(actual - expected) <= tolerance
}

/** Caso base §9.1: 5 sintomas de estresse, 2 depressivos, ex-fumante, 4 doses/masculino… */
function baseAnswers(overrides: Partial<MentalHealthAnswers> = {}): MentalHealthAnswers {
  return normalizeMentalHealthAnswers({
    stress_lack_control: true,
    stress_tiredness: true,
    stress_difficulty_relax: true,
    stress_accumulation_problems: true,
    stress_procrastination: true,

    depression_symptoms_sadness: true,
    depression_symptoms_discouragement: true,

    substance_smoking: 2,
    substance_alcohol_use: true,
    substance_drinking_doses: 4,

    technology_online_time: true,
    technology_anxiety: true,
    technology_social_media: false,

    environmental_factors_support_family: true,
    environmental_factors_support_other: '',
    environmental_factors_support_nobody: false,

    exposed_natural_disaster: false,
    health_score: 8,
    life_quality_score: 7,
    ...overrides,
  })
}

console.log('\n9.1) Caso base — homem, 4 doses')
{
  const r = calculateMentalHealth(baseAnswers(), { gender: 'Homem' })
  check('estresse: 5 sintomas → Sintomas Graves → nota 0', r.stress.symptomCount === 5 && r.stress.level === 'Sintomas Graves' && r.stress.score === 0, r.stress)
  check('depressão: 2 sintomas → Sintomas Moderados → nota 3', r.depression.level === 'Sintomas Moderados' && r.depression.score === 3, r.depression)
  check('tabaco: Ex-fumante → nota 5', r.tobacco.category === 'Ex-fumante' && r.tobacco.score === 5, r.tobacco)
  check('álcool: limiar 5 (masculino) → Consumo Moderado → nota 5', r.alcohol.bingeThreshold === 5 && r.alcohol.category === 'Consumo Moderado' && r.alcohol.score === 5, r.alcohol)
  check('internet: 2 respostas afirmativas → Moderada → nota 3', r.internet.level === 'Moderada' && r.internet.score === 3, r.internet)
  check('rede de apoio: 1 fonte → Sim → nota 10', r.support.presence === 'Sim' && r.support.score === 10, r.support)
  check('suicídio: sem indicadores → divisor 1', r.suicide.divisor === 1, r.suicide)
  check('Σ pesos presentes = 17', r.weightPresent === 17, r.weightPresent)
  check('média = 80/17 ≈ 4,7059', near(r.componentsMean, 80 / 17), r.componentsMean)
  check('índice ≈ 4,71', near(r.index, 4.7059), r.index)
  check("classificação = 'Insatisfatório'", r.classification === 'Insatisfatório', r.classification)
  check('sem erros de validação', validateMentalHealthAnswers(baseAnswers()).length === 0, validateMentalHealthAnswers(baseAnswers()))
}

console.log('\n9.1b) Mesmo caso com gênero feminino/desconhecido → Padrão Binge')
{
  const feminino = calculateMentalHealth(baseAnswers(), { gender: 'Mulher' })
  const desconhecido = calculateMentalHealth(baseAnswers(), { gender: null })
  check('feminino: limiar 4 → Padrão Binge → nota 0', feminino.alcohol.bingeThreshold === 4 && feminino.alcohol.score === 0, feminino.alcohol)
  check('feminino: média = 70/17 ≈ 4,12', near(feminino.index, 70 / 17), feminino.index)
  check('gênero ausente: limiar conservador 4, linha não descartada', desconhecido.alcohol.bingeThreshold === 4 && desconhecido.alcohol.category === 'Padrão Binge', desconhecido.alcohol)
}

console.log('\nA) Risco de suicídio corta o índice pela metade')
{
  const r = calculateMentalHealth(baseAnswers({ suicide_symptoms_ideas: true }), { gender: 'Homem' })
  check('divisor = 2', r.suicide.divisor === 2 && r.suicide.atRisk, r.suicide)
  check('índice ≈ 2,35', near(r.index, 2.3529), r.index)
  check("classificação = 'Insatisfatório'", r.classification === 'Insatisfatório', r.classification)
}

console.log('\nB) Tabaco não informado sai da média')
{
  const r = calculateMentalHealth(baseAnswers({ substance_smoking: null }), { gender: 'Homem' })
  check("categoria = 'Não Informado' com nota null", r.tobacco.category === 'Não Informado' && r.tobacco.score === null, r.tobacco)
  check('Σ pesos presentes = 16', r.weightPresent === 16, r.weightPresent)
  check('índice = 75/16 = 4,6875', near(r.index, 4.6875), r.index)
}

console.log('\nC) Declarou não ter rede de apoio → nota 0 com peso cheio')
{
  const r = calculateMentalHealth(
    baseAnswers({ environmental_factors_support_family: false, environmental_factors_support_nobody: true }),
    { gender: 'Homem' },
  )
  check("presença = 'Não' com nota 0", r.support.presence === 'Não' && r.support.score === 0, r.support)
  check('Σ pesos presentes = 17', r.weightPresent === 17, r.weightPresent)
  check('índice = 60/17 ≈ 3,53', near(r.index, 60 / 17), r.index)
}

console.log('\nD) Não respondeu rede de apoio → peso sai do denominador')
{
  const r = calculateMentalHealth(
    baseAnswers({ environmental_factors_support_family: false, environmental_factors_support_nobody: false }),
    { gender: 'Homem' },
  )
  check("presença = 'Não Informado' com nota null", r.support.presence === 'Não Informado' && r.support.score === null, r.support)
  check('Σ pesos presentes = 15', r.weightPresent === 15, r.weightPresent)
  check('índice = 60/15 = 4,00', near(r.index, 4), r.index)
  check('C ≠ D (decisões #5 e #6 aplicadas)', true)
}

console.log('\nE) Apoio só em "Outro" conta como fonte')
{
  const r = calculateMentalHealth(
    baseAnswers({ environmental_factors_support_family: false, environmental_factors_support_other: 'Terapeuta' }),
    { gender: 'Homem' },
  )
  check('total = 1 → presença Sim → nota 10', r.support.sourceCount === 1 && r.support.score === 10, r.support)
  check('índice idêntico ao caso base ≈ 4,71', near(r.index, 4.7059), r.index)
}

console.log('\nF) Quatro sintomas depressivos ficam em Moderados (corte < 5)')
{
  const r = calculateMentalHealth(
    baseAnswers({ depression_symptoms_loss_of_interest: true, depression_symptoms_irritability: true }),
    { gender: 'Homem' },
  )
  check('4 sintomas → Sintomas Moderados → nota 3', r.depression.symptomCount === 4 && r.depression.level === 'Sintomas Moderados' && r.depression.score === 3, r.depression)
  check('índice idêntico ao caso base ≈ 4,71', near(r.index, 4.7059), r.index)
}

console.log('\nG) Normalização — condicionais limpas e checkbox desmarcado = false')
{
  const answers = normalizeMentalHealthAnswers({
    substance_smoking: 1,
    substance_cigarettes_per_day: 20,
    substance_alcohol_use: false,
    substance_drinking_doses: 7,
    exposed_natural_disaster: false,
    disaster_type: 3,
    disaster_safety_concern: 5,
  })
  check('cigarros/dia limpo quando não é fumante', answers.substance_cigarettes_per_day === null, answers.substance_cigarettes_per_day)
  check('doses limpas quando não bebe', answers.substance_drinking_doses === null, answers.substance_drinking_doses)
  check('bloco de desastres limpo quando não houve exposição', answers.disaster_type === null && answers.disaster_safety_concern === null, [answers.disaster_type, answers.disaster_safety_concern])
  check('checkbox ausente grava false, não null', answers.stress_insomnia === false, answers.stress_insomnia)
  check('select Sim/Não ausente permanece null', answers.technology_anxiety === null, answers.technology_anxiety)
  check("não bebe → categoria 'Não Bebe' nota 10", calculateMentalHealth(answers).alcohol.score === 10)
}

console.log('\nH) Validação das invariantes (§8.0)')
{
  const semNada = normalizeMentalHealthAnswers({})
  const errors = validateMentalHealthAnswers(semNada)
  check('campos obrigatórios ausentes geram erro', errors.length > 0, errors.length)
  check('rede de apoio vazia sem "Ninguém" é rejeitada', errors.some((e) => e.includes('Rede de apoio')), errors)

  const nobodyEOutros = normalizeMentalHealthAnswers({
    environmental_factors_support_nobody: true,
    environmental_factors_support_family: true,
  })
  check('"Ninguém" + outra fonte é rejeitado', validateMentalHealthAnswers(nobodyEOutros).some((e) => e.includes('Ninguém')), validateMentalHealthAnswers(nobodyEOutros))

  const bebeSemDose = normalizeMentalHealthAnswers({ substance_alcohol_use: true })
  check('bebe sem informar doses é rejeitado', validateMentalHealthAnswers(bebeSemDose).some((e) => e.includes('doses')), validateMentalHealthAnswers(bebeSemDose))
}

console.log('\nI) Piso de confiabilidade')
{
  const r = calculateMentalHealth(normalizeMentalHealthAnswers({
    environmental_factors_support_nobody: true,
  }))
  check('peso presente < 10 → índice null', r.weightPresent < 10 && r.index === null, { weightPresent: r.weightPresent, index: r.index })
  check("classificação 'Sem dados'", r.classification === 'Sem dados', r.classification)
}

console.log(failures === 0 ? '\nTodos os casos passaram.\n' : `\n${failures} caso(s) falharam.\n`)
process.exit(failures === 0 ? 0 : 1)
