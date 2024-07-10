/*
Copyright 2024 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/
import * as core from '@actions/core'
import * as httpm from '@actions/http-client'

const SUPPORTED_METRIC_FORMATS: string[] = ['gauge', 'count']
const SUPPORTED_EVENT_TYPES: string[] = [
  'CUSTOM_INFO',
  'CUSTOM_ALERT',
  'CUSTOM_ANNOTATION',
  'CUSTOM_CONFIGURATION',
  'RESOURCE_CONTENTION_EVENT',
  'AVAILABILITY_EVENT',
  'ERROR_EVENT',
  'PERFORMANCE_EVENT',
  'CUSTOM_DEPLOYMENT',
  'MARKED_FOR_TERMINATION'
]

export type Properties = { [key: string]: string }
export type Dimensions = { [key: string]: string }

export interface Metric {
  metric: string
  value: string
  format?: string
  timestamp?: number
  dimensions?: Dimensions
}

export interface Event {
  type: string
  title: string
  timeout?: number
  startTime?: number
  endTime?: number
  entitySelector?: string
  properties?: Properties
}

export function safeKey(key: string): string {
  return key.toLowerCase().replace(/[^.0-9a-z_-]/gi, '_')
}

export function safeValue(value: string): string {
  return value
}

export function metric2line(metric: Metric): string {
  // -- key
  let line = safeKey(metric.metric)

  // -- dimensions
  if (metric.dimensions) {
    for (const [key, value] of Object.entries(metric.dimensions)) {
      if (value && value.length > 0) {
        line += `,${safeKey(key)}="${safeValue(value)}"`
      }
    }
  }

  // -- format
  if (metric.format) {
    if (SUPPORTED_METRIC_FORMATS.includes(metric.format)) {
      line += ` ${metric.format},${metric.value}`
    } else {
      throw Error(
        `Unsupported Metric format for '${metric.metric}' - ${metric.format}`
      )
    }
  } else line += ` ${metric.value}`

  // -- timestamp
  if (metric.timestamp) line += ` ${metric.timestamp}`

  return line
}

export function event2payload(event: Event): {
  [key: string]: number | string | Properties
} {
  let payload: { [key: string]: number | string | Properties } = {}
  if (SUPPORTED_EVENT_TYPES.includes(event.type)) {
    // start with type and title
    payload = {
      eventType: event.type,
      title: event.title
    }

    // -- timeout
    if (event.timeout) payload.timeout = event.timeout

    // -- startTime
    if (event.startTime) payload.startTime = event.startTime

    // -- endTime
    if (event.endTime) payload.endTime = event.endTime

    // -- entitySelector
    if (event.entitySelector) payload.entitySelector = event.entitySelector

    // -- properties
    if (event.properties) payload.properties = event.properties

    return payload
  } else {
    throw Error(`Unsupported Event type for '${event.title}' - ${event.type}`)
  }
}

export async function sendMetrics(
  url: string,
  token: string,
  metrics: Metric[]
): Promise<void> {
  core.info(`Sending ${metrics.length} metric(s)`)

  const lines: string[] = []
  for (const metric of metrics) {
    try {
      const line = metric2line(metric)
      core.info(line)
      lines.push(line)
    } catch (error) {
      core.setFailed((error as Error).message)
    }
  }

  // skip if no valid metrics are present
  if (lines.length === 0) return

  const http: httpm.HttpClient = getClient(token, 'text/plain')
  const res: httpm.HttpClientResponse = await http.post(
    `${url}/api/v2/metrics/ingest`,
    lines.join('\n')
  )

  core.info(await res.readBody())
  if (res.message.statusCode !== 202) {
    core.setFailed(`HTTP request failed - ${res.message.statusCode}`)
  }
}

export async function sendEvents(
  url: string,
  token: string,
  events: Event[]
): Promise<void> {
  core.info(`Sending ${events.length} event(s)`)

  let payload = {}
  for (const event of events) {
    try {
      payload = event2payload(event)
      core.info(JSON.stringify(payload))
    } catch (error) {
      core.setFailed((error as Error).message)
      continue
    }

    const http: httpm.HttpClient = getClient(token, 'application/json')
    const res: httpm.HttpClientResponse = await http.post(
      `${url}/api/v2/events/ingest`,
      JSON.stringify(payload)
    )

    core.info(await res.readBody())
    if (res.message.statusCode !== 201) {
      core.setFailed(`HTTP request failed - ${res.message.statusCode}`)
    }
  }
}

function getClient(token: string, content: string): httpm.HttpClient {
  return new httpm.HttpClient('dt-http-client', [], {
    headers: {
      Authorization: `Api-Token ${token}`,
      'Content-Type': content
    }
  })
}
