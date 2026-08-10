# Módulos "Comportamento e Emoção", "Fatores Ambientais" e "Percepção sobre Saúde e Qualidade de Vida"

Especificação completa para reimplementação em outra aplicação: enunciados, opções,
nomes de variáveis, tipos, regras de gravação, derivações analíticas e fórmulas de
índice. Escrito para ser lido e executado por um agente de IA — cada questão tem
nome de campo, tipo, valor gravado e o que o dashboard faz com ele.

| | |
|---|---|
| **Formulário (fonte)** | [app/views/mapping_interviews/_form.html.erb](../app/views/mapping_interviews/_form.html.erb) |
| **Rótulos** | [config/locales/pt-BR.yml](../config/locales/pt-BR.yml) → `pt-BR.activerecord.attributes.mapping_interview` |
| **Enums / tipos** | [app/models/mapping_interview.rb](../app/models/mapping_interview.rb) · [db/schema.rb](../db/schema.rb) |
| **Campos aceitos no POST** | [app/controllers/mapping_interviews_controller.rb](../app/controllers/mapping_interviews_controller.rb#L253-L439) (`mapping_interview_params`) |
| **Comportamento de UI** | [public/js/script_js.js](../public/js/script_js.js#L1009-L1098) |
| **Cálculos do dashboard** | [scripts_corrigidos_neo_sem_modulos_cmpc.sql](../scripts_corrigidos_neo_sem_modulos_cmpc.sql) |
| **Tabela de respostas** | `mapping_interviews` (alias `mi` no SQL) |
| **Tabela de derivados** | `formulas`, ligada por `formulas.mapping_interview_id = mi.id` |

> **Este documento é a especificação da nova aplicação**, não um retrato fiel do
> sistema legado. Onde a implementação atual (Ruby ou SQL) tem defeito ou
> ambiguidade, o texto descreve **o comportamento corrigido a implementar** e
> marca o desvio com 🔧. O legado correspondente fica registrado na
> [§7](#7-decisões-de-implementação-e-legado), para quem precisar migrar dados
> históricos.
>
> Regra de precedência ao ler o legado: quando o comentário do script SQL
> divergir do SQL executado, vale o SQL executado.

---

## Índice

1. [Escopo dos três módulos](#1-escopo-dos-três-módulos)
2. [Convenções de gravação](#2-convenções-de-gravação)
3. [Módulo COMPORTAMENTO E EMOÇÃO](#3-módulo-comportamento-e-emoção)
4. [Módulo FATORES AMBIENTAIS](#4-módulo-fatores-ambientais)
5. [Módulo PERCEPÇÃO SOBRE SAÚDE E QUALIDADE DE VIDA](#5-módulo-percepção-sobre-saúde-e-qualidade-de-vida)
6. [Camada analítica — derivadas, níveis, notas e índices](#6-camada-analítica--derivadas-níveis-notas-e-índices)
7. [Decisões de implementação e legado](#7-decisões-de-implementação-e-legado)
8. [Contrato de dados consolidado](#8-contrato-de-dados-consolidado)
9. [Checklist de implementação](#9-checklist-de-implementação)

---

## 1. Escopo dos três módulos

No formulário original, as seções aparecem nesta ordem e com estes títulos exatos
(são blocos `collapse` do Bootstrap, um `card` por seção):

| # | Seção do formulário | Nº de campos persistidos | Alimenta |
|---|---|---|---|
| 4 | `COMPORTAMENTO E EMOÇÃO` | 57 | Estresse, Sintomas Depressivos, Suicídio, Tabaco, Álcool, Internet, Substâncias, Desastres |
| 5 | `FATORES AMBIENTAIS` | 13 | Rede de Apoio, Vivências do último ano |
| 6 | `PERCEPÇÃO SOBRE SAÚDE E QUALIDADE DE VIDA` | 3 | Componentes diretos do Índice de Saúde Mental |

Total: **73 campos**. Dois deles não existem no legado e são introduzidos por esta
especificação: 🔧 `substance_alcohol_use` ([§3.7](#37-consumo-de-álcool)) e a
reabilitação de 🔧 `environmental_factors_support_nobody` ([§4.1](#41-rede-de-apoio)).

Os três módulos, juntos, alimentam **todo o domínio Saúde Mental** do dashboard.
Nenhum deles alimenta o domínio Risco Psicossocial (esse vem da seção
`FATORES PSICOSSOCIAIS`, documentada em
[dominios_subdominios_e_formulas.md](dominios_subdominios_e_formulas.md)).

Dependência externa importante: o cálculo de **Uso de Álcool** precisa do
**gênero** do colaborador, que **não** pertence a estes módulos — vem de
`colaboradores_reporting.gender` (`1 = Masculino`, `2 = Feminino`, `3 = Outro`).
Ver [§6.6](#66-álcool).

---

## 2. Convenções de gravação

### 2.1 Tipos por widget

| Widget no formulário | Tipo da coluna | Valor gravado |
|---|---|---|
| Grupo de checkboxes (sintomas, fontes, substâncias, apoio, vivências) | `boolean` | `true` quando marcado; `false` quando desmarcado |
| `select` Sim/Não | `boolean` | `true` / `false`; opção em branco → `NULL` |
| `select` de lista fechada (enum) | `integer` | código inteiro do enum (ver cada questão) |
| `number_field` | `integer` | número digitado |
| `text_field` / `text_area` | `string` / `text` | texto livre; vazio → `''` ou `NULL` |

**Checkbox → boolean:** o Rails emite um `hidden` com `0` antes de cada checkbox,
portanto um checkbox desmarcado grava `false`, **não** `NULL`. Em uma
reimplementação fora do Rails, replique isso: todo checkbox de grupo deve
persistir `false` explicitamente quando não marcado. Todo o SQL do dashboard
compara com `= TRUE`, então `false` e `NULL` são tratados igualmente como "não" —
mas manter `false` evita ambiguidade entre "não marcou" e "não respondeu".

### 2.2 Os checkboxes "Nenhuma das anteriores" são apenas UI

Cinco grupos exibem uma opção final do tipo "Nenhuma das anteriores" / "Nenhum" /
"Não identifico nenhuma fonte de estresse". Elas são renderizadas com
`check_box_tag ..., name: nil` — **não têm `name`, logo não são enviadas ao
servidor e não são persistidas**. Servem só para forçar uma resposta explícita.

O comportamento JS (`[data-check-group]` + `[data-check-group-none]`) é:

```text
ao marcar "Nenhuma das anteriores"  → desmarca todos os outros do grupo
ao marcar qualquer outro            → desmarca "Nenhuma das anteriores"
enquanto nenhum item estiver marcado → "Nenhuma das anteriores" fica required
```

Ou seja: **o grupo é obrigatório na prática** — o usuário marca ao menos um item
ou declara explicitamente "nenhum", e nesse caso todos os booleans do grupo vão
`false`.

**Exceção — Rede de Apoio.** 🔧 Nessa seção a opção "Ninguém" **é persistida**, em
`environmental_factors_support_nobody`. Motivo: é a única opção "nenhum" que
carrega significado clínico próprio (ausência de rede de apoio é fator de risco,
não ausência de dado) e a única que precisa ser distinguida de "não respondeu"
no cálculo do índice. Ver [§4.1](#41-rede-de-apoio) e [§6.4](#64-rede-de-apoio).

Nos demais grupos, "todos `false`" já codifica "nenhum" sem ambiguidade e a
mecânica de obrigatoriedade garante resposta explícita — não crie coluna para
eles. As colunas legadas `suicide_symptoms_none` e `substance_used_none` existem
na tabela e constam de `mapping_interview_params`, mas nunca recebem valor
(permanecem sempre `NULL`): 🔧 **não replicar**.

### 2.3 Campos "Outro (qual?)"

Nos grupos de Rede de Apoio e Vivências existe um par:

* um `check_box_tag '_environmental_factors_support_other'` (com underscore
  inicial) — **não é permitido** em `mapping_interview_params`, portanto é
  descartado no servidor; serve apenas para revelar o campo de texto;
* um `text_field` real (`environmental_factors_support_other`) — **este** é o dado
  persistido.

Regra derivada usada pelo dashboard: **"marcou Outro" ≡ o texto não está vazio.**

### 2.4 Campos condicionais

Três blocos aparecem/desaparecem via `data-toggle-visibility`. A visibilidade é
puramente visual: **campos ocultos continuam sendo enviados** com o valor que
tiverem. Ao reimplementar, decida explicitamente se quer limpar o valor ao ocultar.

| Gatilho | Revela | Condição |
|---|---|---|
| `exposed_natural_disaster` | bloco de desastres (4 selects) | valor `true` |
| 🔧 `substance_alcohol_use` | `substance_drinking_doses` | valor `true` |
| `substance_smoking` | `substance_cigarettes_per_day` | valor `4` (`use`) |
| `job_factors_score_bullying` **ou** `job_factors_score_coworker_moral_harassment` | bloco de tipos de assédio | valor ∈ {3, 4, 5} — *pertence à seção Fatores Psicossociais* |

🔧 **Regra nova:** ao ocultar um bloco condicional, **limpe os campos dependentes
para `NULL`** antes de enviar. No legado eles continuam sendo submetidos com o
último valor digitado, o que produz resíduos como `substance_cigarettes_per_day`
preenchido para quem declarou não ser fumante.

### 2.5 Obrigatoriedade

| Campo | Obrigatório |
|---|---|
| `health_score`, `life_quality_score` | sempre |
| `substance_smoking` | sempre |
| 🔧 `substance_alcohol_use` | sempre |
| 🔧 `substance_drinking_doses` | **apenas** se `substance_alcohol_use = true` |
| `substance_cigarettes_per_day` | nunca (opcional, só visível se `substance_smoking = 4`) |
| `exposed_natural_disaster` | sempre |
| `disaster_*` | nunca (opcionais, só visíveis se `exposed_natural_disaster = true`) |
| Grupos de checkbox | sempre, pela mecânica de §2.2 (≥1 item **ou** "nenhum") |
| `technology_online_time`, `technology_anxiety`, `technology_social_media` | 🔧 sempre (no legado eram opcionais) |
| `health_observations`, campos "Outro" (texto) | nunca |

---

## 3. Módulo COMPORTAMENTO E EMOÇÃO

Ordem exata de renderização.

### 3.1 Sintomas de estresse

> **Enunciado:** *Em relação as seguintes dificuldades, você vivenciou alguma das
> situações abaixo no último mês?*

Grupo de checkboxes. Todos `boolean`.

| # | Variável | Rótulo da opção |
|---|---|---|
| 1 | `stress_lack_control` | Sensação de falta de controle sobre as coisas |
| 2 | `stress_tiredness` | Cansaço excessivo |
| 3 | `stress_difficulty_relax` | Dificuldade para relaxar |
| 4 | `stress_accumulation_problems` | Sensação de acúmulo de problemas |
| 5 | `stress_procrastination` | Procrastinação (adiar afazeres e compromissos; tarefas inacabadas) |
| 6 | `stress_irritation` | Irritação |
| 7 | `stress_feeling_low_capacity` | Sensação de pouca capacidade para lidar com os problemas |
| 8 | `stress_insomnia` | Insônia |
| 9 | `stress_impairment_decision_making` | Dificuldade de tomar decisões |
| — | *(não persistido)* | Nenhuma das anteriores |

→ Derivações: [§6.1](#61-estresse).

### 3.2 Fontes de estresse

> **Enunciado:** *Atualmente, você identifica alguma situação como possível fonte
> de estresse em sua rotina?*

Grupo de checkboxes. Todos `boolean`.

| # | Variável | Rótulo da opção |
|---|---|---|
| 1 | `stress_source_work` | Trabalho (tensão entre colegas e/ou chefia, sobrecarga/pressão) |
| 2 | `stress_source_study` | Estudos (entregas, prazos, sobrecarga) |
| 3 | `stress_source_money` | Dinheiro (dívidas, despesas altas, diminuição nos ganhos, apostas online) |
| 4 | `stress_source_relationships` | Relacionamentos (brigas, discussões, separações, falecimentos, solidão) |
| 5 | `stress_source_health` | Saúde (doenças crônicas, doença terminal, crise) |
| 6 | `stress_source_technology` | Tecnologia (uso excessivo, sobrecarga - redes sociais, emails, apps de comunicação e internet) |
| 7 | `stress_source_violence` | Violência urbana (assaltos, roubo e outros crimes) |
| 8 | `stress_source_discrimination` | Discriminação (preconceito contra minorias - mulheres, negros, LGBTQIAPN+, entre outros) |
| 9 | `stress_source_politics` | Clima político (divergências, discussões, preocupações) |
| 10 | `stress_source_covid` | Fatores externos: pandemias, mudanças climáticas |
| — | *(não persistido)* | Não identifico nenhuma fonte de estresse |

→ Derivações: [§6.2](#62-fontes-de-estresse). **Não** entram em nenhum índice —
são apenas contagens descritivas.

### 3.3 Exposição a desastres naturais/humanos

Bloco condicional.

🔧 **Correção obrigatória:** no legado a pergunta-gatilho é `required` e **sem
opção em branco**, o que faz o navegador pré-selecionar "Sim" em registro novo —
qualquer submissão sem interação registra exposição a desastre. Na nova
aplicação, renderize sem valor pré-selecionado (opção em branco ou par de
radios sem `checked`), mantendo a obrigatoriedade.

**Gatilho** — `exposed_natural_disaster` · `boolean` · obrigatório

> *Você reside em uma cidade que foi exposta a algum desastre natural ou humano
> nos últimos dois anos? Exemplos são inundações causadas pelo excesso de chuva,
> furacões, ciclones, vendavais com impacto nas moradias, deslizamento de terra,
> tremores, apagões, queimadas, derramamento de óleo ou quedas de barragens.*
>
> `Sim` → `true` · `Não` → `false`

Se `true`, exibe as quatro questões abaixo (todas `integer`, opcionais).

**`disaster_type`**

> *Qual foi o desastre mais intenso para você nos últimos dois anos? Atenção: Em
> caso de mais de um desastre em sua cidade, marque a opção que mais lhe impactou.*

| Valor | Chave | Rótulo |
|---|---|---|
| 1 | `floods` | Inundações causadas pelo excesso de chuva |
| 2 | `landslides` | Escorregamentos ou deslizamentos de terra (deslizamentos de barreira) |
| 3 | `hurricanes` | Furacões, Ciclones ou Vendavais que destruíram moradias |
| 4 | `drought` | Seca ou estiagem |
| 5 | `blackouts` | Apagões na cidade com mais de um dia de duração |
| 6 | `wildfires` | Queimadas |
| 7 | `earthquakes` | Tremores de terra |
| 8 | `tsunami` | Tsunami |
| 9 | `dam_failure` | Queda de barragens |
| 10 | `chemical_spill` | Derramamento de óleo ou outros produtos químicos na água da cidade |
| 11 | `not_applicable` | Não se aplica |

**`disaster_contact`**

> *Qual foi seu contato com o desastre que marcou como mais intenso?*

| Valor | Chave | Rótulo |
|---|---|---|
| 1 | `life_risk_home_impacted` | Corri risco de vida ou minha casa foi diretamente impactada |
| 2 | `close_people_impacted` | Pessoas próximas a mim foram impactadas pelo desastre, mas estive em segurança durante o desastre |
| 3 | `commute_impacted` | Meu deslocamento para o trabalho foi impactado pelo desastre, mas estive em segurança durante o desastre |
| 4 | `city_impacted_no_routine_problems` | Minha cidade foi impactada, mas estive em segurança durante o desastre e não enfrentei problemas em minha rotina |
| 5 | `not_applicable` | Não se aplica |

**`disaster_vulnerability_feeling`**

> *Após o desastre, você se sente mais vulnerável às mudanças climáticas ou
> desastres ambientais futuros?*

**`disaster_safety_concern`**

> *Após o desastre, você tem se preocupado mais com a segurança do seu lar ou
> local de trabalho?*

Ambas usam a mesma escala de 5 pontos:

| Valor | Chave | Rótulo |
|---|---|---|
| 1 | `nothing` | Nada |
| 2 | `little` | Pouco |
| 3 | `moderately` | Moderadamente |
| 4 | `much` | Muito |
| 5 | `extremely` | Extremamente |

→ **Nenhuma derivação analítica existe hoje.** O script SQL não referencia
nenhuma coluna `disaster_*` nem `exposed_natural_disaster`. Se o dashboard novo
precisar destes dados, as métricas terão de ser criadas do zero.

### 3.4 Sintomas depressivos

> **Enunciado:** *Em relação às duas últimas semanas, você apresentou algum dos
> sentimentos listados abaixo de maneira muito frequente (quase todos os dias)?*

Grupo de checkboxes. Todos `boolean`.

| # | Variável | Rótulo da opção |
|---|---|---|
| 1 | `depression_symptoms_sadness` | Tristeza |
| 2 | `depression_symptoms_discouragement` | Desanimo/Desmotivação |
| 3 | `depression_symptoms_loss_of_interest` | Perda de interesse/prazer |
| 4 | `depression_symptoms_irritability` | Irritabilidade |
| 5 | `depression_symptoms_worthless` | Sentiu-se sem valor/desvalorizado |
| 6 | `depression_symptoms_useless` | Sentiu-se inútil |
| 7 | `depression_symptoms_alone` | Sentiu-se abandonado/sozinho |
| 8 | `depression_symptoms_guilty` | Sentiu-se culpado |
| 9 | `depression_symptoms_other` | Outros |
| — | *(não persistido)* | Nenhuma das anteriores |

→ Derivações: [§6.3](#63-sintomas-depressivos).

### 3.5 Indicadores de risco de suicídio

> **Enunciado:** *Nos últimos 30 dias, você apresentou algum dos sentimentos ou
> comportamentos listados abaixo?*

Grupo de checkboxes. Todos `boolean`. **Bloco sensível** — funciona como divisor
do Índice de Saúde Mental (ver §6.9).

| # | Variável | Rótulo da opção |
|---|---|---|
| 1 | `suicide_symptoms_ideas` | Ideias/pensamentos de se matar |
| 2 | `suicide_symptoms_threats` | Ameaças de se matar |
| 3 | `suicide_symptoms_plan` | Plano de acabar com a propria vida |
| 4 | `suicide_symptoms_self_injury` | Autoagressão/autolesão (por exemplo, se cortar) |
| 5 | `suicide_symptoms_attempt` | Tentativas de acabar com a propria vida |
| — | *(não persistido)* | Nenhum |

→ Derivações: [§6.8](#68-suicídio).

### 3.6 Tabagismo

**`substance_smoking`** · `integer` · **obrigatório**

> *Você faz uso de cigarros, cigarrilhas, charutos, cachimbos, cigarros
> eletrônicos (vapes) e/ou similares?*

| Valor | Chave | Rótulo |
|---|---|---|
| 1 | `not` | Não sou fumante |
| 2 | `used` | Sou ex-fumante (Todos os cigarros fumados em sua vida inteira chegam a somar pelo menos 5 maços / 100 cigarros) |
| 3 | `yes_passive` | Sou fumante passivo |
| 4 | `use` | Sou fumante (pelo menos um cigarro por semana) |

**`substance_cigarettes_per_day`** · `integer` · `min: 0` · condicional (`substance_smoking = 4`)

> *Quantos cigarros você fuma por dia?*

Aqui não é preciso pergunta-porta: "Não sou fumante" já é uma opção explícita da
escala, distinta de `NULL`. 🔧 O que muda é o tratamento do `NULL` — deixa de
valer nota 0 e passa a sair da média ([§6.5](#65-tabaco)).

→ Derivações: [§6.5](#65-tabaco).

### 3.7 Consumo de álcool

🔧 **Estrutura nova, em duas etapas.** No legado havia um único campo numérico
obrigatório cujo enunciado terminava com *"Caso não consuma bebidas alcoólicas,
coloque 0 (zero)"* — abstêmios eram forçados a digitar um número, e quem pulava
o campo caía em `Não Informado`, que valia nota 0 (a mesma de um padrão binge).
A nova estrutura separa **abstinência** de **ausência de resposta**.

**🔧 `substance_alcohol_use`** · `boolean` · **obrigatório** · *campo novo*

> *Você consome bebidas alcoólicas?*
>
> `Sim` → `true` · `Não` → `false`
>
> Renderizar sem valor pré-selecionado.

**`substance_drinking_doses`** · `integer` · `min: 1` · obrigatório **somente se**
`substance_alcohol_use = true`; caso contrário não é exibido e grava `NULL`

> *Nos dias em que você consome bebidas alcoólicas, quantas doses você costuma
> ingerir, em média? Dose é igual a um copo de cerveja, uma taça de espumante ou
> vinho, ou uma dose de alguma bebida mais forte.*

Repare que o `min` passa de `0` para `1`: com a pergunta-porta, "zero doses" deixa
de ser uma resposta possível neste campo — quem não bebe responde `Não` na porta.

| Estado | `substance_alcohol_use` | `substance_drinking_doses` | Categoria resultante |
|---|---|---|---|
| Não bebe | `false` | `NULL` | `Não Bebe` → nota **10** |
| Bebe, dose informada | `true` | ≥ 1 | `Consumo Moderado` ou `Padrão Binge` |
| Não respondeu (dado legado/parcial) | `NULL` | `NULL` | `Não Informado` → nota `NULL`, **fora da média** |

→ Derivações: [§6.6](#66-álcool). **Atenção: depende do gênero.**

### 3.8 Uso de substâncias e medicações

> **Enunciado:** *Você usou, nos últimos 30 dias, algumas das substâncias ou
> medicações listadas a seguir?*

Grupo de checkboxes. Todos `boolean`.

| # | Variável | Rótulo da opção |
|---|---|---|
| 1 | `substance_used_antidepressant` | Antidepressivo |
| 2 | `substance_used_anxiolytic` | Ansiolítico |
| 3 | `substance_used_antipsychotic` | Antipsicótico |
| 4 | `substance_used_marihuana` | Maconha |
| 5 | `substance_used_cocaine` | Cocaína |
| 6 | `substance_used_crack` | Crack |
| 7 | `substance_used_ecstasy` | Ecstasy |
| 8 | `substance_used_inhalants` | Inalantes |
| 9 | `substance_used_lsd` | LSD |
| 10 | `substance_used_ayahuasca` | Ayahuasca |
| 11 | `substance_used_amphetamines` | Anfetaminas |
| 12 | `substance_used_weight_loss_medication` | Medicamentos para perda de peso |
| — | *(não persistido)* | Nenhuma das anteriores |

→ Derivações: [§6.10](#610-substâncias-e-cigarros-por-dia-descritivo). Descritivo:
não entram em nenhum índice.

### 3.9 Uso de internet e tecnologia

Três `select` Sim/Não. Todos `boolean`, 🔧 **obrigatórios** (no legado eram
opcionais, deixando 3 dos 8 componentes do índice em branco sem nenhum aviso).

| Variável | Enunciado |
|---|---|
| `technology_online_time` | Você sente que deveria diminuir o seu tempo on-line (redes sociais, e-mails, jogos, aplicativos)? |
| `technology_anxiety` | Você se sente ansioso quando não verifica seu celular ou outro dispositivo (computador, tablet)? |
| `technology_social_media` | Você se sente triste ou frustrado ao se comparar com outras pessoas nas redes sociais? |

→ Derivações: [§6.7](#67-dependência-de-internet).

---

## 4. Módulo FATORES AMBIENTAIS

### 4.1 Rede de apoio

> **Enunciado:** *Com quem você pode contar quando necessita de apoio?*

| # | Variável | Tipo | Rótulo | Conta como fonte de apoio? |
|---|---|---|---|---|
| 1 | `environmental_factors_support_family` | `boolean` | Família | ✅ |
| 2 | `environmental_factors_support_spouse` | `boolean` | Cônjuge/parceiro(a) | ✅ |
| 3 | `environmental_factors_support_friends` | `boolean` | Amigos | ✅ |
| 4 | `environmental_factors_support_coworkers` | `boolean` | Colegas trabalho | ✅ |
| 5 | `environmental_factors_support_other` | `string` | Outro *(checkbox revela campo de texto)* | ✅ **sim** — texto não vazio conta |
| 6 | 🔧 `environmental_factors_support_nobody` | `boolean` | Ninguém | ❌ é a declaração de ausência |

🔧 **Duas correções nesta seção:**

**(a) "Ninguém" passa a ser um campo válido.** No legado a coluna existe e o
checkbox é renderizado com `f.check_box`, mas o campo **não consta da lista de
parâmetros permitidos** do controller → o valor é silenciosamente descartado e a
coluna fica sempre `NULL`. Na nova aplicação ele é persistido e entra no contrato
de entrada, com estas regras:

* mutuamente exclusivo com as opções 1–5 (mesma mecânica de §2.2: marcar
  "Ninguém" desmarca as demais e vice-versa);
* `nobody = true` ⇒ os quatro booleans em `false` **e** `support_other` vazio;
* é o que distingue **"declarou não ter rede de apoio"** (risco real, nota 0) de
  **"não respondeu"** (sem dado, fora da média) — ver [§6.4](#64-rede-de-apoio).

**(b) "Outro" conta como fonte de apoio.** O texto preenchido em
`environmental_factors_support_other` é uma fonte de apoio legítima e entra na
contagem. Só o texto é persistido; o checkbox que o revela é descartável.

→ Derivações: [§6.4](#64-rede-de-apoio).

### 4.2 Vivências do último ano

> **Enunciado:** *No último ano, você vivenciou alguma das situações a seguir?*

| # | Variável | Tipo | Rótulo |
|---|---|---|---|
| 1 | `environmental_factors_events_relationship_crisis` | `boolean` | Dificuldades nas relações familiares e afetivas (separação, conflitos com cônjuge ou outros familiares, infidelidade ou relacionamentos abusivos) |
| 2 | `environmental_factors_events_remarkable_events` | `boolean` | Acontecimentos marcantes (novo relacionamento/casamento, nascimento de filhos) |
| 3 | `environmental_factors_events_death_disease` | `boolean` | Morte ou adoecimento de uma pessoa próxima e importante |
| 4 | `environmental_factors_events_aggression` | `boolean` | Envolvimento em situações de agressões físicas e/ou verbais |
| 5 | `environmental_factors_events_loss` | `boolean` | Perdas financeiras ou profissionais |
| 6 | `environmental_factors_events_legal_issues` | `boolean` | Problemas que envolvem processos legais |
| 7 | `environmental_factors_events_other` | `string` | Outro *(checkbox revela campo de texto)* |
| — | *(não persistido)* | — | Nenhuma das anteriores |

→ Derivações: [§6.11](#611-vivências-do-último-ano-descritivo). Descritivo:
não entram em nenhum índice.

---

## 5. Módulo PERCEPÇÃO SOBRE SAÚDE E QUALIDADE DE VIDA

Cabeçalho exibido antes das questões:

> **Dê uma nota de 0 a 10:**
>
> **Instruções de Preenchimento**
> Quanto mais próximo de **0**, pior a sua avaliação; quanto mais próximo de
> **10**, melhor a sua avaliação.

| Variável | Tipo | Faixa | Obrigatório | Enunciado |
|---|---|---|---|---|
| `health_score` | `integer` | 0–10 | ✅ | No geral, como você avalia sua saúde? |
| `life_quality_score` | `integer` | 0–10 | ✅ | No geral, como você avalia a sua qualidade de vida, considerando seu bem-estar físico, emocional, social e as condições do seu dia a dia? |
| `health_observations` | `text` | livre | ❌ | Se desejar, utilize o espaço abaixo para compartilhar comentários, sugestões ou observações que considere importantes: |

Estas notas **já estão na escala 0–10 do índice** e entram no Índice de Saúde
Mental sem nenhuma transformação, cada uma com peso 2 (ver §6.9).

`health_observations` é texto qualitativo — não entra em cálculo algum.

---

## 6. Camada analítica — derivadas, níveis, notas e índices

### 6.0 Arquitetura do cálculo

O script SQL **não cria** a tabela `formulas`; assume que ela já existe com pelo
menos a coluna `mapping_interview_id` e uma linha por entrevista. Cada métrica é
adicionada com um par:

```sql
ALTER TABLE formulas ADD COLUMN <nome_derivado> <tipo>;

UPDATE formulas
SET <nome_derivado> = <expressão>
FROM mapping_interviews mi
WHERE formulas.mapping_interview_id = mi.id;
```

Métricas que dependem só de outras colunas de `formulas` dispensam o `FROM`.

Padrão recorrente: **flag `_n`** = `CASE WHEN <boolean> = TRUE THEN 1 ELSE 0 END`.
Como o `ELSE` cobre `FALSE` **e** `NULL`, não há propagação de nulo — a contagem
sempre resulta em inteiro.

Cadeia geral dos blocos que viram nota:

```text
booleans → flags _n → total (soma) → nível (faixas textuais) → nota (0–10)
                                                                    ↓
                                              média ponderada → índice → classificação
```

🔧 **Filtro de completude:** no legado, só o `UPDATE` de
`media_individual_risco_psicossocial` filtra por `mi.completed = TRUE`; todos os
demais processam **todas** as linhas, inclusive entrevistas incompletas. Na nova
aplicação, aplique `completed = true` (ou equivalente) em **todos** os cálculos.

### 6.0.1 🔧 Convenção de "sem resposta" — regra transversal

Esta é a correção mais importante da camada analítica e vale para **todos** os
componentes com peso no índice.

No legado, todo `CASE` de nota termina em `ELSE 0`. Como consequência, "não
respondi" e "estou na pior situação possível" produzem **a mesma nota 0, com peso
cheio** — ausência de dado vira penalidade. É o que acontece com `uso_de_tabaco =
'Não Informado'` e `uso_de_alcool = 'Não Informado'`.

Regra nova:

```text
componente sem resposta  →  nota = NULL  →  peso NÃO entra no denominador
componente respondido    →  nota 0..10   →  peso entra no denominador
```

Ou seja: o denominador do Índice de Saúde Mental passa a ser **a soma dos pesos
dos componentes efetivamente respondidos**, e não uma constante 17 ([§6.9](#69-índice-de-saúde-mental)).
Implemente as notas com `CASE ... ELSE NULL` (ou sem `ELSE`, que em SQL já
retorna `NULL`) — **nunca** `ELSE 0`, exceto onde 0 for de fato a pior categoria
respondida.

Distinção que deve ficar explícita em cada bloco:

| Situação | Nota | Peso |
|---|---|---|
| Pior situação declarada (fumante, binge, sem rede de apoio…) | **0** | conta |
| Ausência de resposta | **`NULL`** | não conta |

Com o formulário novo (§2.5) todos os componentes são obrigatórios, então na
prática o denominador será 17 na maioria das linhas. A regra existe como rede de
proteção para dados legados, importações parciais e evoluções futuras do
formulário.

---

### 6.1 Estresse

**Flags individuais** (9 colunas `INTEGER` em `formulas`):

| Coluna derivada | Origem |
|---|---|
| `estresse_falta_de_controle_n` | `stress_lack_control` |
| `estresse_cansaco_excessivo_n` | `stress_tiredness` |
| `estresse_dificuldade_relaxar_n` | `stress_difficulty_relax` |
| `estresse_sensacao_acumulo_problemas_n` | `stress_accumulation_problems` |
| `estresse_procrastinacao_n` | `stress_procrastination` |
| `estresse_iritacao_n` *(grafia do script)* | `stress_irritation` |
| `estresse_pouca_capacidade_problemas_n` | `stress_feeling_low_capacity` |
| `estresse_insonia_n` | `stress_insomnia` |
| `estresse_dificuldade_tomar_decisoes_n` | `stress_impairment_decision_making` |

**Total** — `estresse_n_sintomas` `INTEGER`, 0–9: soma dos 9 `CASE WHEN ... = TRUE THEN 1 ELSE 0`
(recalculado direto de `mapping_interviews`, não das flags).

**Nível** — `nivel_de_estresse` `TEXT`:

| Condição | Valor |
|---|---|
| `estresse_n_sintomas < 1` | `Ausência de Sintomas` |
| `< 2` | `Sintomas Leves` |
| `< 5` | `Sintomas Moderados` |
| caso contrário (≥ 5) | `Sintomas Graves` |

**Nota** — `nota_estresse` `INTEGER`:

| Nível | Nota |
|---|---|
| Ausência de Sintomas | **10** |
| Sintomas Leves | **7** |
| Sintomas Moderados | **3** |
| Sintomas Graves | **0** |

Peso no Índice de Saúde Mental: **3**.

---

### 6.2 Fontes de estresse

Dez flags `INTEGER`, puramente descritivas (contagem por fonte no dashboard).
**Não há total, nível nem nota.**

| Coluna derivada | Origem |
|---|---|
| `fonte_estresse_trabalho_n` | `stress_source_work` |
| `fonte_estresse_estudos_n` | `stress_source_study` |
| `fonte_estresse_dinheiro_n` | `stress_source_money` |
| `fonte_estresse_relacionamentos_n` | `stress_source_relationships` |
| `fonte_estresse_saude_n` | `stress_source_health` |
| `fonte_estresse_tecnologia_n` | `stress_source_technology` |
| `fonte_estresse_violencia_n` | `stress_source_violence` |
| `fonte_estresse_discriminacao_n` | `stress_source_discrimination` |
| `fonte_estresse_clima_politico_n` | `stress_source_politics` |
| `fonte_estresse_covid_n` | `stress_source_covid` |

---

### 6.3 Sintomas depressivos

**Flags individuais** (9 colunas `INTEGER`, mesmo padrão
`CASE WHEN ... = TRUE THEN 1 ELSE 0`):

| Coluna derivada | Origem |
|---|---|
| `sintomas_depressivos_tristeza_n` | `depression_symptoms_sadness` |
| `sintomas_depressivos_desanimo_desmotivacao_n` | `depression_symptoms_discouragement` |
| `sintomas_depressivos_perda_interesse_prazer` ⚠️ *(sem sufixo `_n`)* | `depression_symptoms_loss_of_interest` |
| `sintomas_depressivos_irritabilidade_n` | `depression_symptoms_irritability` |
| `sintomas_depressivos_sentiu_sem_valor_desvalorizado` ⚠️ *(sem sufixo `_n`)* | `depression_symptoms_worthless` |
| `sintomas_depressivos_sentiu_inutil_n` | `depression_symptoms_useless` |
| `sintomas_depressivos_sentiu_abandonado_sozinho_n` | `depression_symptoms_alone` |
| `sintomas_depressivos_sentiu_culpado_n` | `depression_symptoms_guilty` |
| `sintomas_depressivos_outros` ⚠️ *(sem sufixo `_n`)* | `depression_symptoms_other` |

> A nomenclatura do script é irregular (três colunas sem `_n`). Padronize na nova
> aplicação.

**Total** — `sintomas_depressivos_n` `INTEGER`, 0–9.

**Nível** — `nivel_de_sintomas_depressivos` `TEXT`:

| Condição | Valor |
|---|---|
| `sintomas_depressivos_n < 1` | `Ausência de Sintomas` |
| `< 2` | `Sintomas Leves` |
| **`< 5`** | `Sintomas Moderados` |
| caso contrário (≥ 5) | `Sintomas Graves` |

🔧 **Decisão: adotar o corte `< 5`** (ou seja, 5+ sintomas ⇒ `Sintomas Graves`).
O legado tem duas versões conflitantes — o SQL executado usa `< 5`, o comentário
do próprio script e o código Ruby usam `< 4`. Três razões para fixar `< 5`:

1. **Critério clínico.** O bloco replica a estrutura de rastreio de episódio
   depressivo maior: nove sintomas, janela de duas semanas, presença "quase todos
   os dias". O DSM-5 usa exatamente **≥ 5 sintomas** nessa janela como limiar do
   episódio depressivo maior. O corte `< 5` faz a faixa `Sintomas Graves`
   coincidir com o limiar clínico consagrado; `< 4` dispara o alarme mais alto
   antes dele.
2. **Consistência interna.** O bloco de estresse (§6.1) tem os mesmos 9 itens e
   usa as faixas `<1 / <2 / <5 / ≥5`. Com `< 5` os dois blocos de sintomas ficam
   com a mesma régua, o que torna o dashboard comparável e a documentação
   ensinável.
3. **Continuidade da série histórica.** É o que já roda em produção; manter
   evita reclassificar retroativamente todas as entrevistas existentes.

Impacto prático: quem marca exatamente 4 sintomas fica em `Sintomas Moderados`
(nota 3), não em `Sintomas Graves` (nota 0). O código Ruby deve ser corrigido
para `< 5` se for mantido em paralelo.

**Nota** — `nota_sintomas_depressivos` `INTEGER`: 10 / 7 / 3 / 0, mesma
correspondência de §6.1.

Peso no Índice de Saúde Mental: **3**.

---

### 6.4 Rede de apoio

**Flags individuais** (`INTEGER`):

| Coluna derivada | Regra |
|---|---|
| `rede_de_apoio_familia_n` | `environmental_factors_support_family = TRUE → 1` |
| `rede_de_apoio_conjuge_parceiro_n` | `environmental_factors_support_spouse = TRUE → 1` |
| `rede_de_apoio_amigos_n` | `environmental_factors_support_friends = TRUE → 1` |
| `rede_de_apoio_colegas_trabalho_n` | `environmental_factors_support_coworkers = TRUE → 1` |
| `rede_de_apoio_outros_n` | `COALESCE(environmental_factors_support_other, '') <> '' → 1`, senão `0` |

✅ `rede_de_apoio_outros_n` mantém a regra do SQL legado — **"Outro" é uma fonte
de apoio como qualquer outra**. Use `COALESCE` para que `NULL` não escape para o
`ELSE` por acidente.

**Total** — `rede_de_apoio_n_total` `INTEGER`, 0–5: soma das cinco flags.

**Presença** — `rede_de_apoio_presenca` `TEXT`, agora com três estados 🔧:

| Condição | `rede_de_apoio_presenca` |
|---|---|
| `rede_de_apoio_n_total > 0` | `Sim` |
| `rede_de_apoio_n_total = 0` **e** `environmental_factors_support_nobody = TRUE` | `Não` |
| `rede_de_apoio_n_total = 0` **e** `nobody` não é `TRUE` | `Não Informado` |

**Nota** — `nota_rede_de_apoio` `INTEGER`:

| Presença | Nota | Peso |
|---|---|---|
| `Sim` | **10** | conta |
| `Não` (declarou "Ninguém") | **0** | conta |
| `Não Informado` | **`NULL`** | não conta |

```sql
UPDATE formulas
SET nota_rede_de_apoio = CASE
    WHEN rede_de_apoio_presenca = 'Sim' THEN 10
    WHEN rede_de_apoio_presenca = 'Não' THEN 0
    ELSE NULL
END;
```

A nota continua binária: ter uma fonte de apoio vale o mesmo que ter cinco. O que
muda 🔧 é que "não respondeu" deixa de ser lido como "não tem apoio" — antes,
qualquer linha sem resposta recebia nota 0 com peso 2.

Peso no Índice de Saúde Mental: **2**.

---

### 6.5 Tabaco

**Categoria** — `uso_de_tabaco` `TEXT`, mapeada direto do inteiro:

| `substance_smoking` | `uso_de_tabaco` |
|---|---|
| 1 | `Não fumante` |
| 2 | `Ex-fumante` |
| 3 | `Fumante passivo` |
| 4 | `Fumante` |
| `NULL` / outro | `Não Informado` |

**Nota** — `nota_tabaco` `INTEGER`:

| Categoria | Nota | Peso |
|---|---|---|
| Não fumante | **10** | conta |
| Ex-fumante | **5** | conta |
| Fumante passivo | **5** | conta |
| Fumante | **0** | conta |
| Não Informado | 🔧 **`NULL`** | **não conta** |

```sql
UPDATE formulas
SET nota_tabaco = CASE
    WHEN uso_de_tabaco = 'Não fumante'     THEN 10
    WHEN uso_de_tabaco = 'Ex-fumante'      THEN 5
    WHEN uso_de_tabaco = 'Fumante passivo' THEN 5
    WHEN uso_de_tabaco = 'Fumante'         THEN 0
    ELSE NULL                              -- 'Não Informado' sai da média
END;
```

🔧 No legado, `Não Informado` caía no `ELSE 0` e recebia a **mesma nota de um
fumante ativo**, com peso cheio. Aqui sai da média (§6.0.1).

Peso no Índice de Saúde Mental: **1**.

---

### 6.6 Álcool

Requer `JOIN` com o colaborador:

```sql
FROM mapping_interviews mi
JOIN evaluations e            ON e.id = mi.evaluation_id
JOIN colaboradores_reporting cr ON cr.colaborador_id = e.colaborador_id
```

**Gênero** — `genero` `TEXT`: `cr.gender` 1 → `Masculino`, 2 → `Feminino`,
3 → `Outro`, senão `Não Informado`.

✅ **O limiar de binge é por gênero** — decisão mantida do SQL legado, que segue a
definição usual de consumo binge (5 doses para homens, 4 para mulheres). O código
Ruby, que fixa 4 para todos "porque não tem acesso ao gênero", deve ser corrigido
ou descartado.

🔧 **Limiar padrão quando o gênero é desconhecido:** use **4** (o mais
conservador). No legado, gênero ausente jogava a linha inteira em
`Não Informado`, descartando uma resposta que existia.

**Categoria** — `uso_de_alcool` `TEXT`. A abstinência agora vem da pergunta-porta
(§3.7), não de `doses = 0`:

| Condição | Categoria |
|---|---|
| `substance_alcohol_use = FALSE` | `Não Bebe` |
| `substance_alcohol_use = TRUE` e `1 ≤ doses < limiar` | `Consumo Moderado` |
| `substance_alcohol_use = TRUE` e `doses ≥ limiar` | `Padrão Binge` |
| demais casos (porta `NULL`, ou `TRUE` sem dose informada) | `Não Informado` |

Limiar por gênero (`colaboradores_reporting.gender`):

| Gênero | Limiar de binge |
|---|---|
| Masculino (1) | **5** |
| Feminino (2) | **4** |
| Outro (3) | **4** |
| 🔧 Desconhecido / `NULL` | **4** (conservador) |

```sql
UPDATE formulas
SET uso_de_alcool = CASE
    WHEN mi.substance_alcohol_use = FALSE THEN 'Não Bebe'
    WHEN mi.substance_alcohol_use = TRUE AND mi.substance_drinking_doses IS NOT NULL THEN
        CASE
            WHEN mi.substance_drinking_doses >= (CASE WHEN cr.gender = 1 THEN 5 ELSE 4 END)
                THEN 'Padrão Binge'
            ELSE 'Consumo Moderado'
        END
    ELSE 'Não Informado'
END
FROM mapping_interviews mi
JOIN evaluations e              ON e.id = mi.evaluation_id
LEFT JOIN colaboradores_reporting cr ON cr.colaborador_id = e.colaborador_id
WHERE formulas.mapping_interview_id = mi.id;
```

🔧 Note o `LEFT JOIN` em `colaboradores_reporting`: no legado é `JOIN` interno,
então **colaborador sem linha de reporting não recebia nenhuma classificação de
álcool** — a coluna ficava `NULL` silenciosamente, sem sequer cair em
`Não Informado`.

**Nota** — `nota_alcool` `INTEGER`:

| Categoria | Nota | Peso |
|---|---|---|
| Não Bebe | **10** | conta |
| Consumo Moderado | **5** | conta |
| Padrão Binge | **0** | conta |
| Não Informado | 🔧 **`NULL`** | **não conta** |

Peso no Índice de Saúde Mental: **2**.

---

### 6.7 Dependência de internet

**Flags e rótulos** — para cada uma das três perguntas, o script cria **duas**
colunas, uma numérica e uma textual:

| Origem | Flag `INTEGER` | Rótulo `TEXT` (`Sim`/`Não`) |
|---|---|---|
| `technology_online_time` | `internet_tempo_excessivo_n` | `internet_tempo_excessivo` |
| `technology_anxiety` | `internet_ansiedade_n` | `internet_ansiedade` |
| `technology_social_media` | `internet_tristeza_frustracao_n` | `internet_tristeza_frustracao` |

**Total** — `dependencia_internet_n_total` `INTEGER`, 0–3: soma das três flags.

**Nível** — `dependencia_internet_nivel` `TEXT`:

| Total | Nível |
|---|---|
| 0 | `Ausente` |
| 1 | `Leve` |
| 2 | `Moderada` |
| 3 | `Alta` |

**Nota** — `nota_internet` `INTEGER`: Ausente → **10**, Leve → **7**,
Moderada → **3**, Alta → **0**.

🔧 **Sem resposta:** se as **três** perguntas forem `NULL`, `dependencia_internet_nivel`
recebe `Não Informado` e `nota_internet` recebe `NULL` (fora da média). Se ao
menos uma foi respondida, `NULL` nas outras é lido como `Não` — a leitura do
legado. Com as três perguntas obrigatórias (§2.5), isso só afeta dados legados.

Peso no Índice de Saúde Mental: **2**.

---

### 6.8 Suicídio

**Flags individuais** (`INTEGER`):

| Coluna derivada | Origem |
|---|---|
| `suicidio_ideias_pensamentos_n` | `suicide_symptoms_ideas` |
| `suicidio_ameacas_se_matar_n` | `suicide_symptoms_threats` |
| `suicidio_plano_acabar_propria_vida_n` | `suicide_symptoms_plan` |
| `suicidio_autoagressao_autolesao_n` | `suicide_symptoms_self_injury` |
| `suicidio_tentativas_acabar_propria_vida` | `suicide_symptoms_attempt` |

**Total** — `suicidio_indicadores` `INTEGER`, 0–5.

**Risco** — `suicidio_risco` `INTEGER`: `0` se `suicidio_indicadores < 1`, senão `1`.

**Nota** — `nota_suicidio` `INTEGER`: `suicidio_risco = 1` → **2**, senão **1**.

⚠️ `nota_suicidio` **não é uma parcela ponderada** — é o **divisor** do índice.
Qualquer indicador marcado **corta o Índice de Saúde Mental pela metade**.

---

### 6.9 Índice de Saúde Mental

**Média ponderada dos componentes** — `media_saude_mental_componentes` `NUMERIC`:

```text
                Σ (nota_i × peso_i)   sobre os componentes não nulos
média = ─────────────────────────────────────────────────────────────
                Σ (peso_i)            sobre os componentes não nulos
```

| Componente | Coluna | Peso |
|---|---|---|
| Estresse | `nota_estresse` | 3 |
| Sintomas Depressivos | `nota_sintomas_depressivos` | 3 |
| Tabaco | `nota_tabaco` | 1 |
| Álcool | `nota_alcool` | 2 |
| Internet | `nota_internet` | 2 |
| Rede de Apoio | `nota_rede_de_apoio` | 2 |
| Percepção de saúde | `mi.health_score` | 2 |
| Qualidade de vida | `mi.life_quality_score` | 2 |
| | **Σ pesos** | **17** |

O denominador é somado dinamicamente
(`CASE WHEN <nota> IS NOT NULL THEN <peso> ELSE 0 END`) e protegido por
`NULLIF(..., 0)`.

🔧 **Aqui a correção de §6.0.1 passa a ter efeito.** No legado esse mecanismo era
letra morta: as seis `nota_*` nunca eram nulas (todo `CASE` terminava em
`ELSE 0`), então o denominador valia sempre 17 e "sem resposta" entrava na conta
valendo zero. Com `nota_tabaco`, `nota_alcool`, `nota_internet` e
`nota_rede_de_apoio` podendo ser `NULL`, o denominador passa a refletir de fato
os componentes respondidos.

```sql
UPDATE formulas
SET media_saude_mental_componentes = (
    (
        COALESCE(nota_estresse             * 3, 0) +
        COALESCE(nota_sintomas_depressivos * 3, 0) +
        COALESCE(nota_tabaco               * 1, 0) +
        COALESCE(nota_alcool               * 2, 0) +
        COALESCE(nota_internet             * 2, 0) +
        COALESCE(nota_rede_de_apoio        * 2, 0) +
        COALESCE(mi.health_score           * 2, 0) +
        COALESCE(mi.life_quality_score     * 2, 0)
    )::numeric
    /
    NULLIF((
        (CASE WHEN nota_estresse             IS NOT NULL THEN 3 ELSE 0 END) +
        (CASE WHEN nota_sintomas_depressivos IS NOT NULL THEN 3 ELSE 0 END) +
        (CASE WHEN nota_tabaco               IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN nota_alcool               IS NOT NULL THEN 2 ELSE 0 END) +
        (CASE WHEN nota_internet             IS NOT NULL THEN 2 ELSE 0 END) +
        (CASE WHEN nota_rede_de_apoio        IS NOT NULL THEN 2 ELSE 0 END) +
        (CASE WHEN mi.health_score           IS NOT NULL THEN 2 ELSE 0 END) +
        (CASE WHEN mi.life_quality_score     IS NOT NULL THEN 2 ELSE 0 END)
    )::numeric, 0)
)
FROM mapping_interviews mi
WHERE formulas.mapping_interview_id = mi.id AND mi.completed = TRUE;
```

**Piso de confiabilidade** 🔧 — um índice calculado sobre pouquíssimos componentes
não é comparável com um índice completo. Se a soma dos pesos presentes for
**< 10** (menos de ~60% do total de 17), grave
`indice_saude_mental_calculado = NULL` e classifique como `Sem dados` em vez de
publicar um número frágil. Com o formulário novo isso nunca deve ocorrer; serve
para dados legados e importações parciais.

**Índice** — `indice_saude_mental_calculado` `NUMERIC`:

```text
índice = media_saude_mental_componentes / nota_suicidio
```

`NULL` quando `media_saude_mental_componentes IS NULL` ou `nota_suicidio IS NULL`
ou `nota_suicidio = 0`. Escala resultante: **0–10** (0–5 quando há risco de
suicídio, pois o divisor é 2).

**Classificação** — `classificacao_individual_saude_mental` `TEXT`:

| Condição | Classificação |
|---|---|
| índice `IS NULL` | `Sem dados` |
| `< 5,00` | `Insatisfatório` |
| `< 7,00` | `Regular` |
| `< 9,00` | `Bom` |
| `≥ 9,00` | `Excelente` |

Aqui, ao contrário dos domínios psicossociais, **índice maior = melhor e a
classificação também é "melhor"** — não há inversão de leitura.

**Fórmula fechada, para conferência:**

```text
                 Σ (nota_i × peso_i)  |  nota_i ≠ NULL
                ──────────────────────────────────────
                 Σ (peso_i)           |  nota_i ≠ NULL
índice_saúde = ───────────────────────────────────────
                            nota_suicidio

E = nota_estresse (3)        D = nota_sintomas_depressivos (3)
T = nota_tabaco (1)          A = nota_alcool (2)
I = nota_internet (2)        R = nota_rede_de_apoio (2)
H = health_score (2)         Q = life_quality_score (2)
nota_suicidio ∈ {1, 2}

Com todos os componentes respondidos (caso normal), Σ pesos = 17:
                 (E×3 + D×3 + T×1 + A×2 + I×2 + R×2 + H×2 + Q×2) / 17
índice_saúde = ───────────────────────────────────────────────────────
                                  nota_suicidio
```

---

### 6.10 Substâncias e cigarros por dia (descritivo)

Doze flags `INTEGER` + um valor bruto. Não entram em índice.

| Coluna derivada | Origem |
|---|---|
| `cigarros_por_dia` | `substance_cigarettes_per_day` (cópia direta) |
| `substancias_antidepressivo_n` | `substance_used_antidepressant` |
| `substancias_ansiolitico_n` | `substance_used_anxiolytic` |
| `substancia_antipsicotico_n` | `substance_used_antipsychotic` |
| `substancia_maconha_n` | `substance_used_marihuana` |
| `substancia_cocaina_n` | `substance_used_cocaine` |
| `substancia_crack_n` | `substance_used_crack` |
| `substancia_ecstasy_n` | `substance_used_ecstasy` |
| `substancia_inalantes_n` | `substance_used_inhalants` |
| `substancia_lsd_n` | `substance_used_lsd` |
| `substancia_ayahuasca_n` | `substance_used_ayahuasca` |
| `substancia_anfetaminas_n` | `substance_used_amphetamines` |
| `substancia_remedio_perda_peso_n` | `substance_used_weight_loss_medication` |

🔧 Os nomes acima são os do script legado, com prefixo inconsistente
(`substancias_` plural nas duas primeiras, `substancia_` singular nas demais).
Padronize na nova aplicação — sugestão: `substancia_<nome>_n` para todas.

---

### 6.11 Vivências do último ano (descritivo)

Sete flags `INTEGER`. Não entram em índice.

| Coluna derivada | Regra |
|---|---|
| `vivencias_crises_relacoes_familiares_afetivas_n` | `environmental_factors_events_relationship_crisis = TRUE → 1` |
| `vivencias_acontecimentos_marcantes_n` | `environmental_factors_events_remarkable_events = TRUE → 1` |
| `vivencias_morte_adoecimento_significativo_n` | `environmental_factors_events_death_disease = TRUE → 1` |
| `vivencias_agressoes_n` | `environmental_factors_events_aggression = TRUE → 1` |
| `vivencias_perdas_n` | `environmental_factors_events_loss = TRUE → 1` |
| `vivencias_problemas_legais_n` | `environmental_factors_events_legal_issues = TRUE → 1` |
| `vivencias_outros_n` | 🔧 `COALESCE(environmental_factors_events_other, '') <> '' → 1` |

🔧 O legado usa `!= ''` **sem `COALESCE`**: com a coluna `NULL`, a comparação
resulta em `NULL` e o `CASE` cai no `ELSE` → `0`. O resultado final é o mesmo,
mas por acidente, e é assimétrico em relação a `rede_de_apoio_outros_n`. Use
`COALESCE` nos dois.

---

## 7. Decisões de implementação e legado

O sistema atual mantém **dois** cálculos paralelos, não equivalentes, sobre os
mesmos dados: o Ruby, em [`MappingInterview`](../app/models/mapping_interview.rb)
(`before_update :assign_scores`, grava `mental_health_score`, `stress_score`,
`depression_score`, `tobacco_score`, `alcohol_score`, `internet_use_score`,
`support_score`, `suicide_score` na própria linha da entrevista), e o SQL, em
`formulas`.

🔧 **Decisão estrutural: uma só fonte da verdade — a camada derivada (`formulas`).**
Não porte os dois. As notas por componente devem existir em um único lugar,
recalculável a partir das respostas brutas. Se a aplicação nova precisar dos
scores dentro do registro da entrevista (para exibir resultado ao colaborador,
por exemplo), leia-os da camada derivada em vez de recalcular por outro caminho.

### 7.1 Tabela de decisões

Todas já estão aplicadas ao corpo do documento; esta tabela existe para rastreio
e para quem for migrar dados históricos.

| # | Tema | Ruby legado | SQL legado | ✅ Decisão adotada | Onde |
|---|---|---|---|---|---|
| 1 | Faixa "Sintomas Moderados" de depressão | `count < 4` | `< 5` | **`< 5`** — alinha `Sintomas Graves` ao limiar do DSM-5 (≥5 sintomas em 2 semanas), espelha o bloco de estresse e preserva a série histórica | [§6.3](#63-sintomas-depressivos) |
| 2 | Limiar de binge alcoólico | fixo em 4, ignora gênero | 5 masc. / 4 fem./outro | **Por gênero** (5/4), com fallback **4** quando o gênero é desconhecido | [§6.6](#66-álcool) |
| 3 | "Outro" na rede de apoio | ignorado | conta como fonte | **Conta como fonte de apoio** | [§6.4](#64-rede-de-apoio) |
| 4 | Abstêmio de álcool | tinha de digitar `0` | idem | **Pergunta-porta `substance_alcohol_use`**; quem não bebe não responde doses e recebe `Não Bebe` → nota 10 | [§3.7](#37-consumo-de-álcool) |
| 5 | Componente sem resposta (tabaco, álcool, internet, rede de apoio) | peso removido da média | **nota 0 com peso cheio** | **Nota `NULL`, peso fora do denominador** — ausência de dado nunca é penalidade | [§6.0.1](#601--convenção-de-sem-resposta--regra-transversal) |
| 6 | `environmental_factors_support_nobody` | — | nunca preenchido (não permitido no controller) | **Campo válido e persistido**, mutuamente exclusivo com as demais opções; separa "não tem apoio" (nota 0) de "não respondeu" (`NULL`) | [§4.1](#41-rede-de-apoio) |
| 7 | Colaborador sem linha em `colaboradores_reporting` | n/a | `JOIN` interno descarta a linha | **`LEFT JOIN`** + fallback de limiar | [§6.6](#66-álcool) |
| 8 | Universo processado | por registro | `UPDATE` em massa **sem** filtro `completed` | **`completed = true` em todos os cálculos** | [§6.0](#60-arquitetura-do-cálculo) |
| 9 | `exposed_natural_disaster` | — | `required` sem opção em branco → pré-seleciona "Sim" | **Sem valor pré-selecionado**, mantendo obrigatoriedade | [§3.3](#33-exposição-a-desastres-naturaishumanos) |
| 10 | Campos ocultos por condicional | — | continuam sendo enviados com o último valor | **Limpar para `NULL` ao ocultar** | [§2.4](#24-campos-condicionais) |
| 11 | `suicide_symptoms_none`, `substance_used_none` | — | colunas existem, nunca preenchidas | **Não replicar** | [§2.2](#22-os-checkboxes-nenhuma-das-anteriores-são-apenas-ui) |
| 12 | Perguntas de internet | — | opcionais | **Obrigatórias** (eram 3 dos 8 componentes do índice ficando em branco) | [§2.5](#25-obrigatoriedade) |
| 13 | Nomenclatura das colunas derivadas | — | irregular (`estresse_iritacao_n`, 3 colunas de depressão sem `_n`, `substancias_`/`substancia_`) | **Padronizar**: sufixo `_n` em toda flag, prefixo singular consistente, sem erros de grafia | [§6.3](#63-sintomas-depressivos), [§6.10](#610-substâncias-e-cigarros-por-dia-descritivo) |
| 14 | `vivencias_outros_n` | — | `!= ''` sem `COALESCE` | **`COALESCE(campo,'') <> ''`**, igual à rede de apoio | [§6.11](#611-vivências-do-último-ano-descritivo) |

### 7.2 O que permanece fora de escopo

* **Bloco de desastres naturais** (§3.3): continua **descritivo**, sem métrica
  derivada — é o estado atual e esta especificação não inventa índices para ele.
  Se o dashboard novo precisar, as métricas terão de ser desenhadas do zero
  (sugestão de ponto de partida: uma flag de exposição e um cruzamento de
  `disaster_contact` com `disaster_vulnerability_feeling`).
* **Fontes de estresse, substâncias e vivências**: seguem descritivos, sem peso
  em índice. São contagens de frequência para o dashboard.
* **Domínio Risco Psicossocial**: fora destes três módulos, documentado em
  [dominios_subdominios_e_formulas.md](dominios_subdominios_e_formulas.md).

### 7.3 Impacto sobre dados históricos

Se a base legada for migrada, estas decisões **reclassificam** parte dos
registros. Recalcule tudo a partir das respostas brutas em vez de copiar as
colunas derivadas antigas, e espere estas diferenças:

| Decisão | Quem muda | Direção |
|---|---|---|
| #2 limiar por gênero | homens com 4 doses | melhora (nota 0 → 5), se vier do Ruby |
| #3 "Outro" conta | quem só preencheu "Outro" na rede de apoio | melhora (0 → 10), se vier do Ruby |
| #5 sem resposta fora da média | linhas com tabaco/álcool/internet/apoio em branco | melhora — deixam de levar nota 0 com peso |
| #6 "Ninguém" persistido | linhas antigas: impossível distinguir "ninguém" de "não respondeu" | tratar como `Não Informado` na migração |
| #8 filtro `completed` | entrevistas incompletas | saem do dashboard |

`substance_alcohol_use` (#4) não existe no histórico. Regra de retrocompatibilidade
para a migração: `substance_drinking_doses = 0` → `substance_alcohol_use = false`;
`doses ≥ 1` → `true`; `doses IS NULL` → `NULL`.

---

## 8. Contrato de dados consolidado

Payload mínimo dos três módulos, para uma API equivalente. Tipos em JSON Schema
informal; `null` permitido em tudo que não está marcado como obrigatório.

```jsonc
{
  // ── COMPORTAMENTO E EMOÇÃO ────────────────────────────────────────────
  // Estresse — sintomas (grupo obrigatório: ≥1 marcado ou "nenhum" explícito)
  "stress_lack_control":                boolean,
  "stress_tiredness":                   boolean,
  "stress_difficulty_relax":            boolean,
  "stress_accumulation_problems":       boolean,
  "stress_procrastination":             boolean,
  "stress_irritation":                  boolean,
  "stress_feeling_low_capacity":        boolean,
  "stress_insomnia":                    boolean,
  "stress_impairment_decision_making":  boolean,

  // Fontes de estresse (grupo obrigatório)
  "stress_source_work":            boolean,
  "stress_source_study":           boolean,
  "stress_source_money":           boolean,
  "stress_source_relationships":   boolean,
  "stress_source_health":          boolean,
  "stress_source_technology":      boolean,
  "stress_source_violence":        boolean,
  "stress_source_discrimination":  boolean,
  "stress_source_politics":        boolean,
  "stress_source_covid":           boolean,

  // Desastres (bloco condicional a exposed_natural_disaster === true)
  "exposed_natural_disaster":        boolean,      // obrigatório
  "disaster_type":                   1..11 | null,
  "disaster_contact":                1..5  | null,
  "disaster_vulnerability_feeling":  1..5  | null,
  "disaster_safety_concern":         1..5  | null,

  // Sintomas depressivos (grupo obrigatório)
  "depression_symptoms_sadness":            boolean,
  "depression_symptoms_discouragement":     boolean,
  "depression_symptoms_loss_of_interest":   boolean,
  "depression_symptoms_irritability":       boolean,
  "depression_symptoms_worthless":          boolean,
  "depression_symptoms_useless":            boolean,
  "depression_symptoms_alone":              boolean,
  "depression_symptoms_guilty":             boolean,
  "depression_symptoms_other":              boolean,

  // Suicídio (grupo obrigatório) — divisor do índice
  "suicide_symptoms_ideas":       boolean,
  "suicide_symptoms_threats":     boolean,
  "suicide_symptoms_plan":        boolean,
  "suicide_symptoms_self_injury": boolean,
  "suicide_symptoms_attempt":     boolean,

  // Substâncias
  "substance_smoking":             1..4,          // obrigatório
  "substance_cigarettes_per_day":  integer >= 0 | null,  // só se substance_smoking === 4; null caso contrário
  "substance_alcohol_use":         boolean,       // 🔧 NOVO — obrigatório (pergunta-porta)
  "substance_drinking_doses":      integer >= 1 | null,  // obrigatório sse substance_alcohol_use === true; null caso contrário
  "substance_used_antidepressant":          boolean,
  "substance_used_anxiolytic":              boolean,
  "substance_used_antipsychotic":           boolean,
  "substance_used_marihuana":               boolean,
  "substance_used_cocaine":                 boolean,
  "substance_used_crack":                   boolean,
  "substance_used_ecstasy":                 boolean,
  "substance_used_inhalants":               boolean,
  "substance_used_lsd":                     boolean,
  "substance_used_ayahuasca":               boolean,
  "substance_used_amphetamines":            boolean,
  "substance_used_weight_loss_medication":  boolean,

  // Internet / tecnologia — 🔧 obrigatórias
  "technology_online_time":  boolean,
  "technology_anxiety":      boolean,
  "technology_social_media": boolean,

  // ── FATORES AMBIENTAIS ────────────────────────────────────────────────
  // Grupo obrigatório: ≥1 fonte marcada (ou texto em "outro") XOR nobody === true
  "environmental_factors_support_family":     boolean,
  "environmental_factors_support_spouse":     boolean,
  "environmental_factors_support_friends":    boolean,
  "environmental_factors_support_coworkers":  boolean,
  "environmental_factors_support_other":      string | null,
  "environmental_factors_support_nobody":     boolean,   // 🔧 agora válido e persistido

  "environmental_factors_events_relationship_crisis": boolean,
  "environmental_factors_events_remarkable_events":   boolean,
  "environmental_factors_events_death_disease":       boolean,
  "environmental_factors_events_aggression":          boolean,
  "environmental_factors_events_loss":                boolean,
  "environmental_factors_events_legal_issues":        boolean,
  "environmental_factors_events_other":               string | null,

  // ── PERCEPÇÃO SOBRE SAÚDE E QUALIDADE DE VIDA ─────────────────────────
  "health_score":         0..10,        // obrigatório
  "life_quality_score":   0..10,        // obrigatório
  "health_observations":  string | null
}
```

**Dependência externa para o cálculo de álcool:**

```jsonc
{ "gender": 1 /* Masculino */ | 2 /* Feminino */ | 3 /* Outro */ | null }
```

🔧 `null` é aceito: o limiar de binge cai para 4 (conservador) e o cálculo segue —
a linha **não** é descartada, como acontecia no legado.

### 8.0 Invariantes de validação

Regras que o backend deve rejeitar, independentemente do que a UI envie:

```text
substance_alcohol_use === false  ⇒  substance_drinking_doses === null
substance_alcohol_use === true   ⇒  substance_drinking_doses >= 1
substance_smoking !== 4          ⇒  substance_cigarettes_per_day === null
exposed_natural_disaster !== true ⇒ disaster_type = disaster_contact
                                   = disaster_vulnerability_feeling
                                   = disaster_safety_concern = null
support_nobody === true          ⇒  as 4 fontes === false E support_other vazio
support_nobody === false         ⇒  ≥1 fonte === true OU support_other não vazio
0 <= health_score <= 10          e   0 <= life_quality_score <= 10
```

### 8.1 Colunas derivadas produzidas (resumo)

| Bloco | Flags `_n` | Total | Nível/Categoria | Nota | Entra no índice | Nota pode ser `NULL`? |
|---|---|---|---|---|---|---|
| Estresse | 9 | `estresse_n_sintomas` | `nivel_de_estresse` | `nota_estresse` | ✅ peso 3 | não |
| Sintomas depressivos | 9 | `sintomas_depressivos_n` | `nivel_de_sintomas_depressivos` | `nota_sintomas_depressivos` | ✅ peso 3 | não |
| Tabaco | — | — | `uso_de_tabaco` | `nota_tabaco` | ✅ peso 1 | 🔧 sim (`Não Informado`) |
| Álcool | — | — | `uso_de_alcool` (+ `genero`) | `nota_alcool` | ✅ peso 2 | 🔧 sim (`Não Informado`) |
| Internet | 3 (+3 textuais) | `dependencia_internet_n_total` | `dependencia_internet_nivel` | `nota_internet` | ✅ peso 2 | 🔧 sim (3 respostas nulas) |
| Rede de apoio | 5 | `rede_de_apoio_n_total` | `rede_de_apoio_presenca` | `nota_rede_de_apoio` | ✅ peso 2 | 🔧 sim (`Não Informado`) |
| Percepção de saúde | — | — | — | `health_score` (bruto) | ✅ peso 2 | sim (campo nulo) |
| Qualidade de vida | — | — | — | `life_quality_score` (bruto) | ✅ peso 2 | sim (campo nulo) |
| Suicídio | 5 | `suicidio_indicadores` | `suicidio_risco` | `nota_suicidio` | ⚠️ **divisor** | não |
| Fontes de estresse | 10 | — | — | — | ❌ descritivo | — |
| Substâncias | 12 (+`cigarros_por_dia`) | — | — | — | ❌ descritivo | — |
| Vivências | 7 | — | — | — | ❌ descritivo | — |
| Desastres | — | — | — | — | ❌ sem métrica | — |

Saída final: `media_saude_mental_componentes` → `indice_saude_mental_calculado`
→ `classificacao_individual_saude_mental`.

---

## 9. Checklist de implementação

1. **Persistência** — criar as 73 colunas de resposta (57 + 13 + 3) com os tipos
   de §8, incluindo as duas novas: `substance_alcohol_use` e
   `environmental_factors_support_nobody`. Checkbox desmarcado grava `false`,
   não `NULL`. Não criar `suicide_symptoms_none` nem `substance_used_none`.
2. **Validação** — implementar todas as invariantes de §8.0 no backend, não só na
   UI; grupos de checkbox obrigatórios pela mecânica de §2.2; obrigatoriedade
   conforme §2.5 (as três perguntas de internet agora são obrigatórias).
3. **Condicionais** — três gatilhos (§2.4), e **limpar para `NULL`** os campos
   dependentes ao ocultar.
4. **Sem pré-seleção** — `exposed_natural_disaster` e `substance_alcohol_use`
   renderizados sem valor default.
5. **Camada derivada** — flags `_n` → totais → níveis → notas → média → índice →
   classificação, nesta ordem. Padronizar a nomenclatura (§7.1 #13).
6. **Convenção de `NULL`** — nenhuma nota com `ELSE 0` para "sem resposta";
   `nota_tabaco`, `nota_alcool`, `nota_internet` e `nota_rede_de_apoio` são
   nuláveis, e o denominador da média soma só os pesos presentes (§6.0.1, §6.9).
7. **Gênero** — `LEFT JOIN` com o cadastro do colaborador e fallback de limiar 4
   quando ausente; nunca descartar a linha por falta de gênero.
8. **Filtro de completude** — `completed = true` em **todos** os cálculos.
9. **Fonte única** — implementar apenas a camada derivada; não replicar o cálculo
   Ruby em paralelo (§7).
10. **Migração** (se houver dados históricos) — recalcular do bruto, aplicar a
    regra de retrocompatibilidade de `substance_alcohol_use` e tratar rede de
    apoio vazia como `Não Informado` (§7.3).
11. **Conferência** — validar com os casos fechados abaixo.

### 9.1 Caso de teste fechado — base

Entrada:

```text
5 sintomas de estresse marcados
2 sintomas depressivos marcados
substance_smoking = 2 (ex-fumante)
substance_alcohol_use = true, substance_drinking_doses = 4, gender = 1 (Masculino)
technology_online_time = true, technology_anxiety = true, technology_social_media = false
environmental_factors_support_family = true, demais false, support_other = '', nobody = false
nenhum indicador de suicídio
health_score = 8, life_quality_score = 7
```

Derivação esperada:

```text
estresse_n_sintomas          = 5  → Sintomas Graves        → nota_estresse             = 0
sintomas_depressivos_n       = 2  → Sintomas Moderados     → nota_sintomas_depressivos = 3
uso_de_tabaco                = Ex-fumante                  → nota_tabaco               = 5
uso_de_alcool                = Consumo Moderado (4 < 5)    → nota_alcool               = 5
dependencia_internet_n_total = 2  → Moderada               → nota_internet             = 3
rede_de_apoio_n_total        = 1  → Sim                    → nota_rede_de_apoio        = 10
suicidio_indicadores         = 0  → risco 0                → nota_suicidio             = 1

Σ pesos presentes = 3+3+1+2+2+2+2+2 = 17

media = (0×3 + 3×3 + 5×1 + 5×2 + 3×2 + 10×2 + 8×2 + 7×2) / 17
      = (0 + 9 + 5 + 10 + 6 + 20 + 16 + 14) / 17
      = 80 / 17 ≈ 4,7059

indice_saude_mental_calculado = 4,7059 / 1 ≈ 4,71
classificacao_individual_saude_mental = 'Insatisfatório'   (< 5,00)
```

Note o limiar por gênero em ação: 4 doses para um homem é `Consumo Moderado`
(limiar 5). A mesma resposta para gênero feminino, outro ou desconhecido seria
`Padrão Binge` → `nota_alcool = 0` → média `70/17 ≈ 4,12`.

### 9.2 Variações — exercitam as regras corrigidas

Cada variação parte do caso base e altera **um** elemento.

**A · Risco de suicídio** — marcar um indicador:

```text
nota_suicidio = 2  →  índice = 4,7059 / 2 ≈ 2,35  →  'Insatisfatório'
```

**B · Tabaco não informado** (dado legado) — `substance_smoking = NULL`:

```text
uso_de_tabaco = 'Não Informado' → nota_tabaco = NULL → peso 1 sai do denominador
Σ pesos presentes = 16
media = (80 − 5) / 16 = 75 / 16 = 4,6875  →  índice ≈ 4,69
```

Confere a regra de §6.0.1: sem a correção, o legado daria `nota_tabaco = 0` com
peso 1 → `75/17 ≈ 4,41`, punindo quem simplesmente não respondeu.

**C · Declarou não ter rede de apoio** — `support_nobody = true`, demais fontes
`false`:

```text
rede_de_apoio_n_total = 0, nobody = TRUE → presença 'Não' → nota_rede_de_apoio = 0
Σ pesos presentes = 17
media = (80 − 20) / 17 = 60 / 17 ≈ 3,5294  →  índice ≈ 3,53
```

**D · Não respondeu rede de apoio** (dado legado) — tudo `false`, `nobody`
ausente:

```text
presença = 'Não Informado' → nota_rede_de_apoio = NULL → peso 2 sai
Σ pesos presentes = 15
media = 60 / 15 = 4,0000  →  índice = 4,00
```

C e D existem para serem comparados: **3,53 contra 4,00** com exatamente as
mesmas respostas preenchidas. É a distinção que o legado não conseguia fazer — lá,
os dois casos caíam em nota 0 com peso cheio e produziam 3,53. Se a sua
implementação devolver o mesmo número para C e D, a decisão #5 e a #6 não foram
aplicadas.

**E · Apoio só em "Outro"** — todas as fontes `false`, `nobody = false`,
`support_other = 'Terapeuta'`:

```text
rede_de_apoio_outros_n = 1 → total = 1 → presença 'Sim' → nota_rede_de_apoio = 10
média e índice idênticos ao caso base: ≈ 4,71
```

**F · Quatro sintomas depressivos** (fronteira da decisão #1):

```text
sintomas_depressivos_n = 4  → Sintomas Moderados (corte < 5) → nota = 3
média e índice idênticos ao caso base: ≈ 4,71
```

Com o corte `< 4` do Ruby legado, seria `Sintomas Graves` → nota 0 → média
`71/17 ≈ 4,18`.

