import * as core from '@actions/core'
import * as httpm from '@actions/http-client'

export interface Metric {
  metric: string;
  value: string;
  dimensions?: Map<string, string>;
}

export interface Event {
  type: string;
  title: string;
  description: string;
  source: string;
  entities?: string[];
  tags?: string[];
  dimensions?: Map<string, string>;
}

interface TagAttachRule {
  meTypes: string[];
  tags: Tag[];
}

interface Tag {
  context: string;
  key: string;
  value?: string;
}

function getClient(token: string, content: string): httpm.HttpClient {
  return new httpm.HttpClient('dt-http-client', [], {
    headers: {
      Authorization: 'Api-Token '.concat(token),
      'Content-Type': content
    }
  })
}

function safeMetricKey(mkey: string): string {
  return mkey.toLowerCase().replace(/[^0-9a-z_-]/gi, '')
}

function safeDimKey(dkey: string): string {
  return dkey.toLowerCase().replace(/[^0-9a-z_-]/gi, '')
}

function safeDimValue(val: string): string {
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
    if(m.dimensions) {
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

  const res: httpm.HttpClientResponse = await http.post(
    url.concat('/api/v2/metrics/ingest'),
    lines
  )

  if (res.message.statusCode === undefined || res.message.statusCode >= 400) {
    throw new Error(`HTTP request failed: ${res.message.statusMessage}`)
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
    const tagAttachRules : TagAttachRule[] = [];
    // extract tagging rules
    if(e.tags) {
      for (const t of e.tags) {
        const arr = t.split(':')
        if (arr.length === 2) {
          tagAttachRules.push({
            meTypes: [arr[0]],
            tags: [
              {
                context: 'CONTEXTLESS',
                key: arr[1]
              }
            ]
          })
        } else if (arr.length === 3) {
          // tag with key and value
          tagAttachRules.push({
            meTypes: [arr[0]],
            tags: [
              {
                context: 'CONTEXTLESS',
                key: arr[1],
                value: arr[2]
              }
            ]
          })
        }
      }
    }
    // create Dynatrace event structure
    const event = {
      eventType: e.type,
      attachRules: {
        entityIds: e.entities,
        tagRule: tagAttachRules
      },
      source: e.source,
      description: e.description,
      title: e.title,
      customProperties: e.dimensions
    }

    core.info(JSON.stringify(event))

    const res: httpm.HttpClientResponse = await http.post(
      url.concat('/api/v1/events'),
      JSON.stringify(event)
    )

    if (res.message.statusCode === undefined || res.message.statusCode >= 400) {
      throw new Error(`HTTP request failed: ${res.message.statusMessage}`)
    }
  }
}
