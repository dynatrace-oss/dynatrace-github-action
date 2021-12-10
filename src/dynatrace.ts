/*
Copyright 2020 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/
import * as core from '@actions/core'
import * as httpm from '@actions/http-client'

export interface Metric {
  metric: string
  value: string
  dimensions?: Map<string, string>
}

export interface Event {
  type: string
  title?: string
  timeout?: number
  entitySelector: string
  // custom key-value properties
  properties?: Map<string, string>
}

function getClient(token: string, content: string): httpm.HttpClient {
  return new httpm.HttpClient('dt-http-client', [], {
    headers: {
      Authorization: 'Api-Token '.concat(token),
      'Content-Type': content
    }
  })
}

export function safeMetricKey(mkey: string): string {
  return mkey.toLowerCase().replace(/[^.0-9a-z_-]/gi, '_')
}

export function safeDimKey(dkey: string): string {
  return dkey.toLowerCase().replace(/[^.0-9a-z_-]/gi, '_')
}

export function safeDimValue(val: string): string {
  return val
}

export async function sendMetrics(
  url: string,
  token: string,
  metrics: Metric[]
): Promise<void> {
  core.info(`Sending ${metrics.length} metrics`)

  const http: httpm.HttpClient = getClient(token, 'text/plain')
  let lines = ''

  for (const m of metrics) {
    lines = lines.concat(safeMetricKey(m.metric))
    if (m.dimensions) {
      for (const [key, value] of Object.entries(m.dimensions)) {
        if (value && value.length > 0) {
          lines = lines
            .concat(',')
            .concat(safeDimKey(key))
            .concat('="')
            .concat(safeDimValue(value))
            .concat('"')
        }
      }
    }

    lines = lines.concat(' ').concat(m.value).concat('\n')
  }
  core.info(lines)

  try {
    const res: httpm.HttpClientResponse = await http.post(
      url.concat('/api/v2/metrics/ingest'),
      lines
    )

    if (res.message.statusCode === undefined || res.message.statusCode >= 400) {
      throw new Error(`HTTP request failed: ${res.message.statusMessage}`)
    }
  } catch (error) {
    core.error(`Exception while sending HTTP request`)
  }
}

export async function sendEvents(
  url: string,
  token: string,
  events: Event[]
): Promise<void> {
  core.info(`Sending ${events.length} events`)

  const http: httpm.HttpClient = getClient(token, 'application/json')

  for (const e of events) {
    // create Dynatrace event structure
    let payload
    if (
      e.type === 'CUSTOM_INFO' ||
      e.type === 'CUSTOM_ALERT' ||
      e.type === 'CUSTOM_ANNOTATION' ||
      e.type === 'CUSTOM_CONFIGURATION' ||
      e.type === 'RESOURCE_CONTENTION_EVENT' ||
      e.type === 'AVAILABILITY_EVENT' ||
      e.type === 'ERROR_EVENT' ||
      e.type === 'PERFORMANCE_EVENT' ||
      e.type === 'CUSTOM_DEPLOYMENT' ||
      e.type === 'MARKED_FOR_TERMINATION'
    ) {
      core.info(`Preparing the event`)
      payload = {
        eventType: e.type,
        title: e.title,
        timeout: e.timeout,
        entitySelector: e.entitySelector,
        properties: e.properties
      }
      core.info(JSON.stringify(payload))

      try {
        const res: httpm.HttpClientResponse = await http.post(
          url.concat('/api/v2/events/ingest'),
          JSON.stringify(payload)
        )

        if (
          res.message.statusCode === undefined ||
          res.message.statusCode >= 400
        ) {
          core.error(`HTTP request failed: ${res.message.statusMessage}`)
          throw new Error(`HTTP request failed: ${res.message.statusMessage}`)
        }
      } catch (error) {
        core.error(`Exception while sending HTTP request`)
        throw new Error(`HTTP request failed: ${error}`)
      }
    } else {
      core.info(`Unsupported event type!`)
    }
  }
}
