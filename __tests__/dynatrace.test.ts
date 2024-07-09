/*
Copyright 2024 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

import { Metric, Event } from '../src/dynatrace'
import * as dt from '../src/dynatrace'

describe('dynatrace', () => {
  it('returns a safe key', async () => {
    expect(dt.safeKey('Dimension.KEY')).toEqual('dimension.key')
  })

  it('returns a safe value', async () => {
    expect(dt.safeValue('Some test value!')).toEqual('Some test value!')
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
})
