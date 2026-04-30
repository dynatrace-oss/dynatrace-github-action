/*
Copyright 2024 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

import * as core from '@actions/core'
import * as httpm from '@actions/http-client'
import { Metric, Event, SdlcEvent } from '../src/dynatrace'
import * as dt from '../src/dynatrace'

jest.mock('@actions/core')
jest.mock('@actions/http-client')

describe('dynatrace', () => {
  it('returns a safe key', async () => {
    expect(dt.safeKey('Dimension.KEY')).toEqual('dimension.key')
  })

  it('returns a safe value', async () => {
    expect(dt.safeValue('Some test value!')).toEqual('Some test value!')
  })

  it('strips newlines from values', async () => {
    expect(dt.safeValue('line1\nline2\r')).toEqual('line1line2')
  })

  it('converts a Metric to line protocol', async () => {
    const metric: Metric = {
      metric: 'test.metric',
      value: '100.0',
      timestamp: 1719368670,
      dimensions: {
        ex: 'value'
      }
    }

    const result = dt.metric2line(metric)
    expect(result).toEqual('test.metric,ex="value" 100.0 1719368670')
  })

  it('can add a format to a Metric', async () => {
    const metric: Metric = {
      metric: 'test.metric',
      format: 'count',
      value: 'delta=100',
      dimensions: {
        ex: 'value'
      }
    }

    const result = dt.metric2line(metric)
    expect(result).toEqual('test.metric,ex="value" count,delta=100')
  })

  it('prevents invalid Metric formats', async () => {
    const metric: Metric = {
      metric: 'bad.metric',
      format: 'bad-format',
      value: '42.0'
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const result = () => dt.metric2line(metric)
    expect(result).toThrow(Error)
    expect(result).toThrow(
      "Unsupported Metric format for 'bad.metric' - bad-format"
    )
  })

  it('converts an Event to its payload', async () => {
    const event: Event = {
      title: 'Example Event',
      type: 'CUSTOM_INFO',
      properties: {
        ex: 'value'
      }
    }

    const result = dt.event2payload(event)
    expect(result).toEqual({
      title: 'Example Event',
      eventType: 'CUSTOM_INFO',
      properties: {
        ex: 'value'
      }
    })
  })

  it('can add a startTime and endTime to an Event', async () => {
    const event: Event = {
      title: 'Example Event',
      type: 'CUSTOM_INFO',
      startTime: 1719368872,
      endTime: 1719369485
    }

    const result = dt.event2payload(event)
    expect(result).toEqual({
      title: 'Example Event',
      eventType: 'CUSTOM_INFO',
      startTime: 1719368872,
      endTime: 1719369485
    })
  })

  it('prevents invalid Event types', async () => {
    const event: Event = {
      title: 'Bad Event',
      type: 'CUSTOM_INVALID'
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const result = () => dt.event2payload(event)
    expect(result).toThrow(Error)
    expect(result).toThrow(
      "Unsupported Event type for 'Bad Event' - CUSTOM_INVALID"
    )
  })

  it('accepts successful event ingest responses', async () => {
    const response =
      '{"reportCount":1,"eventIngestResults":[{"correlationId":"bc7e2e3ed951aa6c","status":"OK"}]}'

    expect(() => dt.validateEventIngestResponse(response)).not.toThrow()
  })

  it('fails when event ingest response has no injected events', async () => {
    const response = '{"reportCount":0,"eventIngestResults":[]}'

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const result = () => dt.validateEventIngestResponse(response)
    expect(result).toThrow(Error)
    expect(result).toThrow(
      'Dynatrace event ingest accepted the request but did not ingest any events'
    )
  })

  it('fails when event ingest response body is not JSON', async () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const result = () => dt.validateEventIngestResponse('ok')

    expect(result).toThrow(Error)
    expect(result).toThrow('Dynatrace event ingest returned invalid JSON')
  })

  describe('sendMetrics', () => {
    const mockPost = jest.fn()
    const mockReadBody = jest.fn()
    const MockHttpClient = httpm.HttpClient as unknown as jest.Mock

    beforeEach(() => {
      MockHttpClient.mockImplementation(() => ({
        post: mockPost
      }))
      mockReadBody.mockResolvedValue('{"linesOk":1}')
      mockPost.mockResolvedValue({
        message: { statusCode: 202 },
        readBody: mockReadBody
      })
    })

    it('sends metrics via HTTP POST', async () => {
      const metrics: Metric[] = [{ metric: 'test.metric', value: '1.0' }]
      await dt.sendMetrics(
        'https://example.live.dynatrace.com',
        'mytoken',
        metrics
      )
      expect(mockPost).toHaveBeenCalledWith(
        'https://example.live.dynatrace.com/api/v2/metrics/ingest',
        'test.metric 1.0'
      )
    })

    it('warns on non-202 HTTP response', async () => {
      mockPost.mockResolvedValue({
        message: { statusCode: 400 },
        readBody: mockReadBody
      })
      const metrics: Metric[] = [{ metric: 'test.metric', value: '1.0' }]
      await dt.sendMetrics(
        'https://example.live.dynatrace.com',
        'mytoken',
        metrics
      )
      expect(jest.mocked(core.warning)).toHaveBeenCalledWith(
        expect.stringContaining('400')
      )
    })

    it('retries on network error and fails after max retries', async () => {
      mockPost.mockRejectedValue(new Error('network failure'))
      const metrics: Metric[] = [{ metric: 'test.metric', value: '1.0' }]
      await expect(
        dt.sendMetrics(
          'https://example.live.dynatrace.com',
          'mytoken',
          metrics,
          2
        )
      ).rejects.toThrow('network failure')
      expect(jest.mocked(core.setFailed)).toHaveBeenCalledWith(
        expect.stringContaining('Failed after 2 attempts')
      )
    })

    it('skips HTTP call when all metrics fail conversion', async () => {
      const metrics: Metric[] = [
        { metric: 'bad.metric', format: 'invalid', value: '1.0' }
      ]
      await dt.sendMetrics(
        'https://example.live.dynatrace.com',
        'mytoken',
        metrics
      )
      expect(mockPost).not.toHaveBeenCalled()
      expect(jest.mocked(core.setFailed)).toHaveBeenCalled()
    })
  })

  describe('validateSdlcEvent', () => {
    it('accepts an event with a string event.id', () => {
      const event: SdlcEvent = { 'event.id': 'deploy-123' }
      expect(() => dt.validateSdlcEvent(event)).not.toThrow()
    })

    it('accepts an event with a numeric event.id', () => {
      const event: SdlcEvent = { 'event.id': 42 }
      expect(() => dt.validateSdlcEvent(event)).not.toThrow()
    })

    it('fails when event.id is missing', () => {
      const event = {} as SdlcEvent
      expect(() => dt.validateSdlcEvent(event)).toThrow(
        "SDLC event is missing required field 'event.id'"
      )
    })

    it('fails when event.id is an empty string', () => {
      const event: SdlcEvent = { 'event.id': '' }
      expect(() => dt.validateSdlcEvent(event)).toThrow(
        "SDLC event is missing required field 'event.id'"
      )
    })
  })

  describe('sendSdlcEvents', () => {
    const mockPost = jest.fn()
    const mockReadBody = jest.fn()
    const MockHttpClient = httpm.HttpClient as unknown as jest.Mock

    beforeEach(() => {
      MockHttpClient.mockImplementation(() => ({
        post: mockPost
      }))
      mockReadBody.mockResolvedValue('')
      mockPost.mockResolvedValue({
        message: { statusCode: 202 },
        readBody: mockReadBody
      })
    })

    it('sends SDLC events via HTTP POST to the OpenPipeline endpoint', async () => {
      const events: SdlcEvent[] = [
        { 'event.id': 'deploy-1', 'event.type': 'deployment' }
      ]
      await dt.sendSdlcEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )
      expect(mockPost).toHaveBeenCalledWith(
        'https://example.live.dynatrace.com/platform/ingest/v1/events.sdlc',
        JSON.stringify(events)
      )
    })

    it('sends multiple SDLC events as a JSON array', async () => {
      const events: SdlcEvent[] = [
        { 'event.id': 'deploy-1' },
        { 'event.id': 'deploy-2', custom: 'value' }
      ]
      await dt.sendSdlcEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(events)
      )
    })

    it('retries on non-202 HTTP response and fails after max retries', async () => {
      mockPost.mockResolvedValue({
        message: { statusCode: 400 },
        readBody: mockReadBody
      })
      const events: SdlcEvent[] = [{ 'event.id': 'deploy-1' }]
      await expect(
        dt.sendSdlcEvents(
          'https://example.live.dynatrace.com',
          'mytoken',
          events,
          2
        )
      ).rejects.toThrow('HTTP request failed - 400')
      expect(jest.mocked(core.setFailed)).toHaveBeenCalledWith(
        expect.stringContaining('Failed after 2 attempts')
      )
    })

    it('skips HTTP call when all SDLC events fail validation', async () => {
      const events = [{ 'event.id': '' }] as SdlcEvent[]
      await dt.sendSdlcEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )
      expect(mockPost).not.toHaveBeenCalled()
      expect(jest.mocked(core.setFailed)).toHaveBeenCalled()
    })
  })

  describe('sendEvents', () => {
    const mockPost = jest.fn()
    const mockReadBody = jest.fn()
    const MockHttpClient = httpm.HttpClient as unknown as jest.Mock

    beforeEach(() => {
      MockHttpClient.mockImplementation(() => ({
        post: mockPost
      }))
      mockReadBody.mockResolvedValue(
        '{"reportCount":1,"eventIngestResults":[{"correlationId":"abc","status":"OK"}]}'
      )
      mockPost.mockResolvedValue({
        message: { statusCode: 201 },
        readBody: mockReadBody
      })
    })

    it('sends events via HTTP POST', async () => {
      const events: Event[] = [{ title: 'Test Event', type: 'CUSTOM_INFO' }]
      await dt.sendEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )
      expect(mockPost).toHaveBeenCalledWith(
        'https://example.live.dynatrace.com/api/v2/events/ingest',
        expect.stringContaining('"CUSTOM_INFO"')
      )
    })

    it('retries on non-201 HTTP response and fails after max retries', async () => {
      mockPost.mockResolvedValue({
        message: { statusCode: 400 },
        readBody: mockReadBody
      })
      const events: Event[] = [{ title: 'Test Event', type: 'CUSTOM_INFO' }]
      await expect(
        dt.sendEvents(
          'https://example.live.dynatrace.com',
          'mytoken',
          events,
          2
        )
      ).rejects.toThrow('HTTP request failed - 400')
      expect(jest.mocked(core.setFailed)).toHaveBeenCalledWith(
        expect.stringContaining('Failed after 2 attempts')
      )
    })
  })
})
