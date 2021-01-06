import * as core from '@actions/core'
import * as httpm from '@actions/http-client'

export interface Metric {
  metric: string
  value: number
  dimensions: string[]
}

export interface Event {
  title: string
  text: string
  severity: string
}

function getClient(token: string): httpm.HttpClient {
  return new httpm.HttpClient('dt-http-client', [], {
    headers: {
      'Authorization': 'Api-Token '.concat(token),
      'Content-Type': 'application/json'
    }
  })
}

export async function sendMetrics(
  url: string,
  token: string,
  metrics: Metric[]
): Promise<void> {
  core.info(`Sending ${metrics.length} metrics`)
  core.info(`Sending to ${url}`)
  
}