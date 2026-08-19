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
export type EventPayload = { [key: string]: number | string | Properties }

export interface SdlcEvent {
  'event.id': string | number
  [key: string]: unknown
}

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
  nodeSelectorFilter?: string
  properties?: Properties
}

export interface SmartscapeNode {
  id: string
  type: string
  name?: string
}

interface QueryResponse {
  state:
    | 'NOT_STARTED'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'RESULT_GONE'
    | 'CANCELLED'
    | 'FAILED'
  requestToken?: string
  result?: {
    records: (Record<string, unknown> | null)[]
  }
}

interface EventIngestResult {
  correlationId?: string
  status?: string
}

interface EventIngestResponse {
  reportCount?: number
  eventIngestResults?: EventIngestResult[]
}

const QUERY_POLL_INTERVAL_MS = 1000
const QUERY_POLL_TIMEOUT_MS = 30000

export function safeKey(key: string): string {
  return key.toLowerCase().replace(/[^.0-9a-z_-]/gi, '_')
}

export function safeValue(value: string): string {
  return value.replace(/[\r\n]/g, '')
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
      throw new Error(
        `Unsupported Metric format for '${metric.metric}' - ${metric.format}`
      )
    }
  } else line += ` ${metric.value}`

  // -- timestamp
  if (metric.timestamp) line += ` ${metric.timestamp}`

  return line
}

export function event2payload(event: Event): EventPayload {
  let payload: EventPayload = {}
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
    throw new Error(
      `Unsupported Event type for '${event.title}' - ${event.type}`
    )
  }
}

export function validateEventIngestResponse(body: string): void {
  let parsedResponse: EventIngestResponse

  try {
    parsedResponse = JSON.parse(body) as EventIngestResponse
  } catch (error) {
    throw new Error(
      `Dynatrace event ingest returned invalid JSON: ${(error as Error).message}`
    )
  }

  const reportCount = parsedResponse.reportCount ?? 0
  const eventIngestResults = parsedResponse.eventIngestResults ?? []
  const successfulIngestions = eventIngestResults.filter(
    result => result.status === 'OK'
  )

  if (reportCount <= 0 || successfulIngestions.length === 0) {
    throw new Error(
      `Dynatrace event ingest accepted the request but did not ingest any events: ${body}`
    )
  }
}

function parseQueryResponse(body: string): QueryResponse {
  try {
    return JSON.parse(body) as QueryResponse
  } catch (error) {
    throw new Error(
      `Dynatrace Grail query returned invalid JSON: ${(error as Error).message}`
    )
  }
}

function recordsToSmartscapeNodes(
  records: (Record<string, unknown> | null)[]
): SmartscapeNode[] {
  const nodes: SmartscapeNode[] = []

  for (const record of records) {
    if (!record) continue

    const { id, type, name } = record
    if (typeof id !== 'string' || typeof type !== 'string') {
      core.warning(
        `Skipping Smartscape node record missing 'id' or 'type': ${JSON.stringify(record)}`
      )
      continue
    }

    nodes.push({ id, type, name: typeof name === 'string' ? name : undefined })
  }

  return nodes
}

// The Grail Query API is served from the AppEngine gateway domain, not the
// classic environment domain used for the events/metrics ingest APIs.
// Covers both the public SaaS domain and Dynatrace's internal pre-release
// (dev/hardening) domains, which use a different naming convention.
export function toGrailUrl(url: string): string {
  if (url.endsWith('.live.dynatrace.com')) {
    return url.replace(/\.live\.dynatrace\.com$/, '.apps.dynatrace.com')
  }
  if (
    url.endsWith('.dynatracelabs.com') &&
    !url.endsWith('.apps.dynatracelabs.com')
  ) {
    return url.replace(/\.dynatracelabs\.com$/, '.apps.dynatracelabs.com')
  }
  return url
}

// The reverse of toGrailUrl(): the classic events/metrics/SDLC ingest APIs
// are served from the environment domain, not the AppEngine gateway domain.
// Normalizes `url` back to that domain in case it was configured as the
// gateway domain instead.
export function fromGrailUrl(url: string): string {
  if (url.endsWith('.apps.dynatrace.com')) {
    return url.replace(/\.apps\.dynatrace\.com$/, '.live.dynatrace.com')
  }
  if (url.endsWith('.apps.dynatracelabs.com')) {
    return url.replace(/\.apps\.dynatracelabs\.com$/, '.dynatracelabs.com')
  }
  return url
}

export async function resolveSmartscapeNodes(
  url: string,
  token: string,
  filter: string
): Promise<SmartscapeNode[]> {
  if (!filter.trim()) {
    throw new Error(`'nodeSelectorFilter' must not be empty`)
  }

  const grailUrl = toGrailUrl(url)
  const query = `smartscapeNodes "*" | filter ${filter} | fields id, type, name`
  const http: httpm.HttpClient = getClient(token, 'application/json')

  const startUrl = `${grailUrl}/platform/storage/query/v1/query:execute`
  const startPayload = JSON.stringify({
    query,
    requestTimeoutMilliseconds: QUERY_POLL_TIMEOUT_MS
  })
  core.debug(`Grail query request: POST ${startUrl} body=${startPayload}`)

  const startRes: httpm.HttpClientResponse = await http.post(
    startUrl,
    startPayload
  )
  const startBody = await startRes.readBody()
  core.debug(
    `Grail query response: ${startRes.message.statusCode} body=${startBody}`
  )
  if (startRes.message.statusCode !== 200) {
    throw new Error(
      `Dynatrace Grail query request failed - ${startRes.message.statusCode}: ${startBody}`
    )
  }

  let queryResponse = parseQueryResponse(startBody)
  const deadline = Date.now() + QUERY_POLL_TIMEOUT_MS

  while (
    (queryResponse.state === 'RUNNING' ||
      queryResponse.state === 'NOT_STARTED') &&
    Date.now() < deadline
  ) {
    if (!queryResponse.requestToken) {
      throw new Error(
        `Dynatrace Grail query did not return a request token to poll for results`
      )
    }

    await new Promise(resolve => setTimeout(resolve, QUERY_POLL_INTERVAL_MS))

    const pollUrl = `${grailUrl}/platform/storage/query/v1/query:poll?request-token=${encodeURIComponent(queryResponse.requestToken)}`
    core.debug(`Grail query poll request: GET ${pollUrl}`)

    const pollRes: httpm.HttpClientResponse = await http.get(pollUrl)
    const pollBody = await pollRes.readBody()
    core.debug(
      `Grail query poll response: ${pollRes.message.statusCode} body=${pollBody}`
    )
    if (pollRes.message.statusCode !== 200) {
      throw new Error(
        `Dynatrace Grail query poll failed - ${pollRes.message.statusCode}: ${pollBody}`
      )
    }

    queryResponse = parseQueryResponse(pollBody)
  }

  if (
    queryResponse.state === 'RUNNING' ||
    queryResponse.state === 'NOT_STARTED'
  ) {
    throw new Error(
      `Timed out waiting for Dynatrace Grail query to complete for filter '${filter}'`
    )
  }

  if (queryResponse.state !== 'SUCCEEDED') {
    throw new Error(
      `Dynatrace Grail query did not succeed (state: ${queryResponse.state}) for filter '${filter}'`
    )
  }

  return recordsToSmartscapeNodes(queryResponse.result?.records ?? [])
}

export async function sendMetrics(
  url: string,
  token: string,
  metrics: Metric[],
  retries = 3
): Promise<void> {
  core.info(`Sending ${metrics.length} metric(s)`)

  const classicUrl = fromGrailUrl(url)
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

  // -- send metrics with retry
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const http: httpm.HttpClient = getClient(token, 'text/plain')
      const res: httpm.HttpClientResponse = await http.post(
        `${classicUrl}/api/v2/metrics/ingest`,
        lines.join('\n')
      )

      core.info(await res.readBody())
      if (res.message.statusCode !== 202) {
        core.warning(`HTTP request failed - ${res.message.statusCode}`)
      }

      return // Exit if successful
    } catch (error) {
      if (attempt === retries) {
        core.setFailed(
          `Failed after ${retries} attempts: ${(error as Error).message}`
        )
        throw error
      }
      core.warning(
        `Attempt ${attempt} failed: ${(error as Error).message}. Retrying...`
      )
    }
  }
}

export async function sendEvents(
  url: string,
  token: string,
  events: Event[],
  retries = 3
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sendEventsInternal(url, token, events)
      return // Exit if successful
    } catch (error) {
      if (attempt === retries) {
        core.setFailed(
          `Failed after ${retries} attempts: ${(error as Error).message}`
        )
        throw error
      }
      core.warning(
        `Attempt ${attempt} failed: ${(error as Error).message}. Retrying...`
      )
    }
  }
}

async function postEvent(
  url: string,
  token: string,
  payload: EventPayload
): Promise<void> {
  core.info(JSON.stringify(payload))

  const http: httpm.HttpClient = getClient(token, 'application/json')
  const res: httpm.HttpClientResponse = await http.post(
    `${fromGrailUrl(url)}/api/v2/events/ingest`,
    JSON.stringify(payload)
  )

  const responseBody = await res.readBody()
  core.info(responseBody)

  if (res.message.statusCode !== 201) {
    throw new Error(
      `HTTP request failed - ${res.message.statusCode}: ${responseBody}`
    )
  }

  validateEventIngestResponse(responseBody)
}

async function buildSmartscapePayloads(
  url: string,
  token: string,
  event: Event
): Promise<EventPayload[] | null> {
  const nodes = await resolveSmartscapeNodes(
    url,
    token,
    event.nodeSelectorFilter as string
  )

  if (nodes.length === 0) {
    core.warning(
      `No Smartscape nodes matched 'nodeSelectorFilter' for event '${event.title}' - skipping.`
    )
    return null
  }

  let basePayload: EventPayload
  try {
    basePayload = event2payload({ ...event, entitySelector: undefined })
  } catch (error) {
    core.setFailed((error as Error).message)
    return null
  }

  return nodes.map(node => ({
    ...basePayload,
    properties: {
      ...event.properties,
      'dt.smartscape_source.id': node.id,
      'dt.smartscape_source.type': node.type
    }
  }))
}

async function buildEventPayload(
  url: string,
  token: string,
  event: Event
): Promise<EventPayload[]> {
  if (event.nodeSelectorFilter) {
    if (event.entitySelector) {
      core.warning(
        `Event '${event.title}' sets both 'entitySelector' and 'nodeSelectorFilter' - 'entitySelector' is ignored.`
      )
    }
    return (await buildSmartscapePayloads(url, token, event)) ?? []
  }

  if (event.entitySelector) {
    core.warning(
      `Event '${event.title}' uses 'entitySelector', which is deprecated for Dynatrace SaaS tenants on Smartscape 2 / Grail (Phase 3). Use 'nodeSelectorFilter' instead.`
    )
  }

  try {
    return [event2payload(event)]
  } catch (error) {
    core.setFailed((error as Error).message)
    return []
  }
}

async function sendEventsInternal(
  url: string,
  token: string,
  events: Event[]
): Promise<void> {
  core.info(`Sending ${events.length} event(s)`)

  const payloads = (
    await Promise.all(events.map(async e => buildEventPayload(url, token, e)))
  ).flat()

  await Promise.all(payloads.map(async p => postEvent(url, token, p)))
}

export function validateSdlcEvent(event: SdlcEvent): void {
  const id = event['event.id']
  if (id === undefined || id === null || id === '') {
    throw new Error(`SDLC event is missing required field 'event.id'`)
  }
}

export async function sendSdlcEvents(
  url: string,
  token: string,
  sdlcEvents: SdlcEvent[],
  retries = 3
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sendSdlcEventsInternal(url, token, sdlcEvents)
      return
    } catch (error) {
      if (attempt === retries) {
        core.setFailed(
          `Failed after ${retries} attempts: ${(error as Error).message}`
        )
        throw error
      }
      core.warning(
        `Attempt ${attempt} failed: ${(error as Error).message}. Retrying...`
      )
    }
  }
}

async function sendSdlcEventsInternal(
  url: string,
  token: string,
  sdlcEvents: SdlcEvent[]
): Promise<void> {
  core.info(`Sending ${sdlcEvents.length} SDLC event(s)`)

  const validEvents: SdlcEvent[] = []
  for (const event of sdlcEvents) {
    try {
      validateSdlcEvent(event)
      core.info(JSON.stringify(event))
      validEvents.push(event)
    } catch (error) {
      core.setFailed((error as Error).message)
    }
  }

  if (validEvents.length === 0) return

  const http: httpm.HttpClient = getClient(token, 'application/json')
  const res: httpm.HttpClientResponse = await http.post(
    `${fromGrailUrl(url)}/platform/ingest/v1/events.sdlc`,
    JSON.stringify(validEvents)
  )

  const responseBody = await res.readBody()
  if (responseBody) core.info(responseBody)

  if (res.message.statusCode !== 202) {
    throw new Error(`HTTP request failed - ${res.message.statusCode}`)
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
