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

  describe('toGrailUrl', () => {
    it('rewrites the public SaaS live domain to the apps domain', () => {
      expect(dt.toGrailUrl('https://abc12345.live.dynatrace.com')).toEqual(
        'https://abc12345.apps.dynatrace.com'
      )
    })

    it('inserts the apps segment for internal dynatracelabs domains', () => {
      expect(dt.toGrailUrl('https://abc12345.dev.dynatracelabs.com')).toEqual(
        'https://abc12345.dev.apps.dynatracelabs.com'
      )
    })

    it('leaves an already-correct apps domain unchanged', () => {
      expect(
        dt.toGrailUrl('https://abc12345.dev.apps.dynatracelabs.com')
      ).toEqual('https://abc12345.dev.apps.dynatracelabs.com')
    })

    it('leaves unrecognized domains unchanged', () => {
      expect(dt.toGrailUrl('https://dynatrace.example.com')).toEqual(
        'https://dynatrace.example.com'
      )
    })
  })

  describe('fromGrailUrl', () => {
    it('rewrites the public SaaS apps domain back to the live domain', () => {
      expect(dt.fromGrailUrl('https://abc12345.apps.dynatrace.com')).toEqual(
        'https://abc12345.live.dynatrace.com'
      )
    })

    it('removes the apps segment for internal dynatracelabs domains', () => {
      expect(
        dt.fromGrailUrl('https://abc12345.dev.apps.dynatracelabs.com')
      ).toEqual('https://abc12345.dev.dynatracelabs.com')
    })

    it('leaves an already-classic domain unchanged', () => {
      expect(dt.fromGrailUrl('https://abc12345.live.dynatrace.com')).toEqual(
        'https://abc12345.live.dynatrace.com'
      )
    })

    it('leaves unrecognized domains unchanged', () => {
      expect(dt.fromGrailUrl('https://dynatrace.example.com')).toEqual(
        'https://dynatrace.example.com'
      )
    })
  })

  describe('resolveSmartscapeNodes', () => {
    const mockPost = jest.fn()
    const mockGet = jest.fn()
    const MockHttpClient = httpm.HttpClient as unknown as jest.Mock

    beforeEach(() => {
      MockHttpClient.mockImplementation(() => ({
        post: mockPost,
        get: mockGet
      }))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('resolves nodes matching the supplied filter', async () => {
      // The mock only returns a match when the filter we passed in actually
      // reached the query body - this proves the result depends on the
      // argument, without inspecting how the HTTP client was called.
      mockPost.mockImplementation(async (_url: string, body: string) => {
        const { query } = JSON.parse(body) as { query: string }
        const records = query.includes('type=="HOST"')
          ? [{ id: 'HOST-1', type: 'HOST', name: 'host-a' }]
          : []
        return {
          message: { statusCode: 200 },
          readBody: async () =>
            JSON.stringify({ state: 'SUCCEEDED', result: { records } })
        }
      })

      const nodes = await dt.resolveSmartscapeNodes(
        'https://example.live.dynatrace.com',
        'mytoken',
        'type=="HOST"'
      )

      expect(nodes).toEqual([{ id: 'HOST-1', type: 'HOST', name: 'host-a' }])
    })

    it('returns an empty array when no records match', async () => {
      mockPost.mockResolvedValue({
        message: { statusCode: 200 },
        readBody: jest
          .fn()
          .mockResolvedValue(
            JSON.stringify({ state: 'SUCCEEDED', result: { records: [] } })
          )
      })

      const nodes = await dt.resolveSmartscapeNodes(
        'https://example.live.dynatrace.com',
        'mytoken',
        'type=="HOST"'
      )
      expect(nodes).toEqual([])
    })

    it('polls until the query succeeds', async () => {
      jest.useFakeTimers()
      mockPost.mockResolvedValue({
        message: { statusCode: 200 },
        readBody: jest
          .fn()
          .mockResolvedValue(
            JSON.stringify({ state: 'RUNNING', requestToken: 'token-1' })
          )
      })
      // The mock only returns the matched node once it sees the request
      // token round-tripped into the poll request - this proves polling
      // actually happened, without asserting on the mock call directly.
      mockGet.mockImplementation(async (url: string) => {
        const records = url.includes('request-token=token-1')
          ? [{ id: 'HOST-1', type: 'HOST' }]
          : []
        return {
          message: { statusCode: 200 },
          readBody: async () =>
            JSON.stringify({ state: 'SUCCEEDED', result: { records } })
        }
      })

      const promise = dt.resolveSmartscapeNodes(
        'https://example.live.dynatrace.com',
        'mytoken',
        'type=="HOST"'
      )
      await jest.advanceTimersByTimeAsync(1000)
      const nodes = await promise

      expect(nodes).toEqual([{ id: 'HOST-1', type: 'HOST' }])
    })

    it('times out waiting for the query to complete', async () => {
      jest.useFakeTimers()
      mockPost.mockResolvedValue({
        message: { statusCode: 200 },
        readBody: jest
          .fn()
          .mockResolvedValue(
            JSON.stringify({ state: 'RUNNING', requestToken: 'token-1' })
          )
      })
      mockGet.mockResolvedValue({
        message: { statusCode: 200 },
        readBody: jest
          .fn()
          .mockResolvedValue(
            JSON.stringify({ state: 'RUNNING', requestToken: 'token-1' })
          )
      })

      const promise = dt.resolveSmartscapeNodes(
        'https://example.live.dynatrace.com',
        'mytoken',
        'type=="HOST"'
      )
      // Attach the rejection handler before advancing timers so it isn't reported as unhandled.
      // eslint-disable-next-line jest/valid-expect
      const assertion = expect(promise).rejects.toThrow('Timed out waiting')
      await jest.advanceTimersByTimeAsync(31000)
      await assertion
    })

    it('fails on a non-200 HTTP response from query:poll', async () => {
      jest.useFakeTimers()
      mockPost.mockResolvedValue({
        message: { statusCode: 200 },
        readBody: jest
          .fn()
          .mockResolvedValue(
            JSON.stringify({ state: 'RUNNING', requestToken: 'token-1' })
          )
      })
      mockGet.mockResolvedValue({
        message: { statusCode: 500 },
        readBody: jest.fn().mockResolvedValue('server error')
      })

      const promise = dt.resolveSmartscapeNodes(
        'https://example.live.dynatrace.com',
        'mytoken',
        'type=="HOST"'
      )
      // Attach the rejection handler before advancing timers so it isn't reported as unhandled.
      // eslint-disable-next-line jest/valid-expect
      const assertion = expect(promise).rejects.toThrow(
        'Dynatrace Grail query poll failed - 500'
      )
      await jest.advanceTimersByTimeAsync(1000)
      await assertion
    })

    it('fails when the query terminates in a non-SUCCEEDED state', async () => {
      mockPost.mockResolvedValue({
        message: { statusCode: 200 },
        readBody: jest
          .fn()
          .mockResolvedValue(JSON.stringify({ state: 'FAILED' }))
      })

      await expect(
        dt.resolveSmartscapeNodes(
          'https://example.live.dynatrace.com',
          'mytoken',
          'type=="HOST"'
        )
      ).rejects.toThrow('state: FAILED')
    })

    it('fails on a non-200 HTTP response from query:execute', async () => {
      mockPost.mockResolvedValue({
        message: { statusCode: 403 },
        readBody: jest.fn().mockResolvedValue('forbidden')
      })

      await expect(
        dt.resolveSmartscapeNodes(
          'https://example.live.dynatrace.com',
          'mytoken',
          'type=="HOST"'
        )
      ).rejects.toThrow('Dynatrace Grail query request failed - 403')
    })

    it('rejects a blank filter', async () => {
      await expect(
        dt.resolveSmartscapeNodes(
          'https://example.live.dynatrace.com',
          'mytoken',
          '   '
        )
      ).rejects.toThrow("'nodeSelectorFilter' must not be empty")
    })
  })

  describe('sendEvents', () => {
    const mockPost = jest.fn()
    const mockGet = jest.fn()
    const mockReadBody = jest.fn()
    const MockHttpClient = httpm.HttpClient as unknown as jest.Mock

    beforeEach(() => {
      MockHttpClient.mockImplementation(() => ({
        post: mockPost,
        get: mockGet
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

    it('fails and skips an event with an unsupported type', async () => {
      const events: Event[] = [{ title: 'Bad Event', type: 'CUSTOM_INVALID' }]
      await dt.sendEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )
      expect(jest.mocked(core.setFailed)).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported Event type')
      )
    })

    it('fails and skips a nodeSelectorFilter event with an unsupported type', async () => {
      // The query resolves a node fine - the failure being tested comes
      // from the event's own type, once the fan-out tries to build its payload.
      mockPost.mockResolvedValue({
        message: { statusCode: 200 },
        readBody: jest.fn().mockResolvedValue(
          JSON.stringify({
            state: 'SUCCEEDED',
            result: { records: [{ id: 'HOST-1', type: 'HOST' }] }
          })
        )
      })

      const events: Event[] = [
        {
          title: 'Bad Event',
          type: 'CUSTOM_INVALID',
          nodeSelectorFilter: 'type=="HOST"'
        }
      ]
      await dt.sendEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )

      expect(jest.mocked(core.setFailed)).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported Event type')
      )
    })

    it('keeps entitySelector working and warns about its deprecation', async () => {
      const events: Event[] = [
        {
          title: 'Test Event',
          type: 'CUSTOM_INFO',
          entitySelector: 'type(host),entityName(myHost)'
        }
      ]
      await dt.sendEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )

      expect(mockPost).toHaveBeenCalledWith(
        'https://example.live.dynatrace.com/api/v2/events/ingest',
        expect.stringContaining(
          '"entitySelector":"type(host),entityName(myHost)"'
        )
      )
      expect(jest.mocked(core.warning)).toHaveBeenCalledWith(
        expect.stringContaining("'entitySelector'")
      )
    })

    it('resolves nodeSelectorFilter and sends one event per matched Smartscape node', async () => {
      mockPost.mockImplementation(async (url: string) => {
        if (url.includes('query:execute')) {
          return {
            message: { statusCode: 200 },
            readBody: async () =>
              JSON.stringify({
                state: 'SUCCEEDED',
                result: {
                  records: [
                    { id: 'HOST-1', type: 'HOST', name: 'host-a' },
                    { id: 'SERVICE-1', type: 'SERVICE', name: 'svc-a' }
                  ]
                }
              })
          }
        }
        return { message: { statusCode: 201 }, readBody: mockReadBody }
      })

      const events: Event[] = [
        {
          title: 'Test Event',
          type: 'CUSTOM_INFO',
          nodeSelectorFilter: 'type=="SERVICE"',
          properties: { source: 'GitHub' }
        }
      ]
      await dt.sendEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )

      const eventsIngestUrl =
        'https://example.live.dynatrace.com/api/v2/events/ingest'

      // One event per matched node, each carrying that node's Smartscape
      // properties plus the user-supplied properties.
      expect(mockPost).toHaveBeenCalledWith(
        eventsIngestUrl,
        expect.stringContaining('"dt.smartscape_source.id":"HOST-1"')
      )
      expect(mockPost).toHaveBeenCalledWith(
        eventsIngestUrl,
        expect.stringContaining('"dt.smartscape_source.id":"SERVICE-1"')
      )
      expect(mockPost).toHaveBeenCalledWith(
        eventsIngestUrl,
        expect.stringContaining('"source":"GitHub"')
      )
      // entitySelector should never appear on nodeSelectorFilter-resolved events.
      expect(mockPost).not.toHaveBeenCalledWith(
        eventsIngestUrl,
        expect.stringContaining('entitySelector')
      )
    })

    it('ignores entitySelector and warns when nodeSelectorFilter is also set', async () => {
      mockGet.mockResolvedValue({
        message: { statusCode: 200 },
        readBody: jest.fn().mockResolvedValue(
          JSON.stringify({
            state: 'SUCCEEDED',
            result: { records: [{ id: 'HOST-1', type: 'HOST' }] }
          })
        )
      })
      mockPost.mockImplementation(async (url: string) => {
        if (url.includes('query:execute')) {
          return {
            message: { statusCode: 200 },
            readBody: async () =>
              JSON.stringify({
                state: 'SUCCEEDED',
                result: { records: [{ id: 'HOST-1', type: 'HOST' }] }
              })
          }
        }
        return { message: { statusCode: 201 }, readBody: mockReadBody }
      })

      const events: Event[] = [
        {
          title: 'Test Event',
          type: 'CUSTOM_INFO',
          entitySelector: 'type(host)',
          nodeSelectorFilter: 'type=="HOST"'
        }
      ]
      await dt.sendEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )

      expect(jest.mocked(core.warning)).toHaveBeenCalledWith(
        expect.stringContaining('ignored')
      )
      expect(mockPost).not.toHaveBeenCalledWith(
        'https://example.live.dynatrace.com/api/v2/events/ingest',
        expect.stringContaining('entitySelector')
      )
    })

    it('warns and skips sending when nodeSelectorFilter matches no nodes', async () => {
      mockPost.mockImplementation(async (url: string) => {
        if (url.includes('query:execute')) {
          return {
            message: { statusCode: 200 },
            readBody: async () =>
              JSON.stringify({ state: 'SUCCEEDED', result: { records: [] } })
          }
        }
        return { message: { statusCode: 201 }, readBody: mockReadBody }
      })

      const events: Event[] = [
        {
          title: 'Test Event',
          type: 'CUSTOM_INFO',
          nodeSelectorFilter: 'type=="HOST"'
        }
      ]
      await dt.sendEvents(
        'https://example.live.dynatrace.com',
        'mytoken',
        events
      )

      expect(jest.mocked(core.warning)).toHaveBeenCalledWith(
        expect.stringContaining('No Smartscape nodes matched')
      )
    })
  })
})
