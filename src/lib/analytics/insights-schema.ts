import type { InsightsEvidence } from './insights-evidence'

/**
 * Contrato da análise estruturada devolvida pela IA (Lumen AI). A rota força
 * esse formato via JSON Schema; a tela renderiza cada bloco em componentes
 * próprios em vez de interpretar texto livre.
 */

export type Severity = 'critico' | 'atencao' | 'positivo' | 'info'
export type InsightModule = 'hse' | 'ietr' | 'saude_mental' | 'adesao' | 'geral'
export type Priority = 'alta' | 'media' | 'baixa'
export type Horizon = 'imediato' | '30_dias' | '90_dias'

export interface InsightsAnalysis {
  headline: string
  overall_risk: 'baixo' | 'moderado' | 'alto' | 'critico'
  executive_summary: string
  key_findings: Array<{ title: string; detail: string; severity: Severity; module: InsightModule; evidence: string }>
  correlation_insights: Array<{ correlation_id: string; interpretation: string; implication: string }>
  module_analyses: Array<{ module: InsightModule; summary: string; highlights: string[] }>
  groups_at_risk: Array<{ segment: string; group: string; reason: string; severity: Severity }>
  recommendations: Array<{ title: string; description: string; priority: Priority; horizon: Horizon; owner: string; module: InsightModule }>
  iso45003_plan: Array<{ area: string; priority: Priority; risk_factors: string[]; interventions: string[] }>
  caveats: string[]
}

export interface InsightsPayload {
  version: 2
  generated_at: string
  model: string
  evidence: InsightsEvidence
  analysis: InsightsAnalysis
}

const severity = { type: 'string', enum: ['critico', 'atencao', 'positivo', 'info'] } as const
const moduleEnum = { type: 'string', enum: ['hse', 'ietr', 'saude_mental', 'adesao', 'geral'] } as const
const priority = { type: 'string', enum: ['alta', 'media', 'baixa'] } as const
const str = { type: 'string' } as const

export const INSIGHTS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    headline: { ...str, description: 'Uma frase de impacto (máx. 20 palavras) que resume o estado do mapeamento.' },
    overall_risk: { type: 'string', enum: ['baixo', 'moderado', 'alto', 'critico'] },
    executive_summary: { ...str, description: '3 a 4 frases para a diretoria, citando os números principais.' },
    key_findings: {
      type: 'array',
      description: '5 a 7 achados principais, do mais ao menos grave. Inclua ao menos um ponto positivo se houver.',
      items: {
        type: 'object',
        properties: {
          title: { ...str, description: 'Título curto (máx. 10 palavras).' },
          detail: { ...str, description: '1 a 2 frases explicando o achado e por que importa.' },
          severity,
          module: moduleEnum,
          evidence: { ...str, description: 'O número que sustenta o achado, ex.: "2,16 de 4" ou "38% dos respondentes".' },
        },
        required: ['title', 'detail', 'severity', 'module', 'evidence'],
      },
    },
    correlation_insights: {
      type: 'array',
      description: 'Interprete as correlações e comparações mais relevantes (use os ids fornecidos). Ignore as desprezíveis.',
      items: {
        type: 'object',
        properties: {
          correlation_id: { ...str, description: 'id exato de uma correlação ou comparação fornecida.' },
          interpretation: { ...str, description: 'O que a relação significa, em linguagem de gestor (1 a 2 frases).' },
          implication: { ...str, description: 'Implicação prática para a gestão (1 frase).' },
        },
        required: ['correlation_id', 'interpretation', 'implication'],
      },
    },
    module_analyses: {
      type: 'array',
      description: 'Uma análise para cada módulo ativo no mapeamento, mais "adesao".',
      items: {
        type: 'object',
        properties: {
          module: moduleEnum,
          summary: { ...str, description: '2 a 3 frases.' },
          highlights: { type: 'array', items: str, description: '2 a 4 bullets curtos com números.' },
        },
        required: ['module', 'summary', 'highlights'],
      },
    },
    groups_at_risk: {
      type: 'array',
      description: 'Até 6 grupos (de qualquer segmento fornecido) que merecem atenção, por risco ou baixa adesão.',
      items: {
        type: 'object',
        properties: { segment: str, group: str, reason: str, severity },
        required: ['segment', 'group', 'reason', 'severity'],
      },
    },
    recommendations: {
      type: 'array',
      description: '6 a 9 ações concretas distribuídas entre os horizontes imediato, 30 dias e 90 dias.',
      items: {
        type: 'object',
        properties: {
          title: { ...str, description: 'Ação no imperativo (máx. 10 palavras).' },
          description: { ...str, description: '1 a 2 frases: como executar e qual resultado esperar.' },
          priority,
          horizon: { type: 'string', enum: ['imediato', '30_dias', '90_dias'] },
          owner: { ...str, description: 'Responsável sugerido: RH, Liderança, SESMT, Diretoria, Comunicação interna...' },
          module: moduleEnum,
        },
        required: ['title', 'description', 'priority', 'horizon', 'owner', 'module'],
      },
    },
    iso45003_plan: {
      type: 'array',
      description: 'Plano por área/segmento prioritário (até 4), alinhado à ISO 45003.',
      items: {
        type: 'object',
        properties: {
          area: str,
          priority,
          risk_factors: { type: 'array', items: str },
          interventions: { type: 'array', items: str },
        },
        required: ['area', 'priority', 'risk_factors', 'interventions'],
      },
    },
    caveats: { type: 'array', items: str, description: '1 a 3 limitações dos dados (amostra, adesão, autodeclaração).' },
  },
  required: [
    'headline', 'overall_risk', 'executive_summary', 'key_findings', 'correlation_insights',
    'module_analyses', 'groups_at_risk', 'recommendations', 'iso45003_plan', 'caveats',
  ],
} as const
