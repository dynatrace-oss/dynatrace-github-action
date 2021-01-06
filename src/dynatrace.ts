import * as core from '@actions/core'
import * as httpm from '@actions/http-client'

export interface Metric {
  metric: string
  value: string
  dimensions: Map<string, string>
}

export interface Event {
  title: string
  text: string
  severity: string
}

function getMetricClient(token: string): httpm.HttpClient {
  return new httpm.HttpClient('dt-http-client', [], {
    headers: {
      'Authorization': 'Api-Token '.concat(token),
      'Content-Type': 'text/plain'
    }
  })
}

function safeMetricKey(mkey: string): string {
  return mkey;
}

function safeDimKey(dkey: string): string {
  return dkey;
}

function safeDimValue(val: string): string {
  return val;
}

export async function sendMetrics(
  url: string,
  token: string,
  metrics: Metric[]
): Promise<void> {
  core.info(`Sending ${metrics.length} metrics`);
  
  const http: httpm.HttpClient = getMetricClient(token);
  let lines = "";

  for (const m of metrics) {
    lines = lines.concat(safeMetricKey(m.metric));
    for (const [key, value] of Object.entries(m.dimensions)) {
      if(value && value.length > 0) {
        lines = lines.concat(',').concat(safeDimKey(key)).concat('="').concat(safeDimValue(value)).concat('"');
      } 
    }
    lines = lines.concat(' ').concat(m.value).concat('\n');
  }
  core.info(lines);
  

  const res: httpm.HttpClientResponse = await http.post(
    url.concat('/api/v2/metrics/ingest'),
    lines
  );

  if (res.message.statusCode === undefined || res.message.statusCode >= 400) {
    throw new Error(`HTTP request failed: ${res.message.statusMessage}`);
  }
  
}