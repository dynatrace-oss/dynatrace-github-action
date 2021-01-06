
export interface Metric {
  type: string
  name: string
  value: number
  dimensions: Map<string, string>
}

export interface Event {
  title: string
  text: string
  severity: string
}

