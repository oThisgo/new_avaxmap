export interface TallyFieldOption {
  id: string
  text: string
}

export interface TallyField {
  key: string
  label: string
  type: string
  value: unknown
  options?: TallyFieldOption[]
}

export interface TallyWebhookPayload {
  eventId: string
  eventType: string
  createdAt: string
  data: {
    responseId: string
    submissionId: string
    respondentId: string
    formId: string
    formName: string
    createdAt: string
    fields: TallyField[]
  }
}
