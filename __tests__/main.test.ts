/*
Copyright 2024 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

import * as core from '@actions/core'
import * as dt from '../src/dynatrace'
import { run } from '../src/main'

jest.mock('@actions/core')
jest.mock('../src/dynatrace')

describe('main', () => {
  const mockGetInput = jest.mocked(core.getInput)
  const mockSetFailed = jest.mocked(core.setFailed)
  const mockSetSecret = jest.mocked(core.setSecret)
  const mockSendMetrics = jest.mocked(dt.sendMetrics)
  const mockSendEvents = jest.mocked(dt.sendEvents)
  const mockSendSdlcEvents = jest.mocked(dt.sendSdlcEvents)

  beforeEach(() => {
    mockGetInput.mockImplementation((name: string) => {
      switch (name) {
        case 'url':
          return 'https://example.live.dynatrace.com'
        case 'token':
          return 'my-token'
        case 'metrics':
          return '[]'
        case 'events':
          return '[]'
        case 'sdlc-events':
          return '[]'
        default:
          return ''
      }
    })
    mockSendMetrics.mockResolvedValue(undefined)
    mockSendEvents.mockResolvedValue(undefined)
    mockSendSdlcEvents.mockResolvedValue(undefined)
  })

  it('masks the token as a secret', async () => {
    await run()
    expect(mockSetSecret).toHaveBeenCalledWith('my-token')
  })

  it('fails when url is empty', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'url') return ''
      if (name === 'token') return 'my-token'
      return '[]'
    })
    await run()
    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('"url"'))
    expect(mockSendMetrics).not.toHaveBeenCalled()
  })

  it('fails when token is empty', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'url') return 'https://example.live.dynatrace.com'
      if (name === 'token') return ''
      return '[]'
    })
    await run()
    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('"token"')
    )
    expect(mockSendMetrics).not.toHaveBeenCalled()
  })

  it('sends metrics when a non-empty metrics list is provided', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'url') return 'https://example.live.dynatrace.com'
      if (name === 'token') return 'my-token'
      if (name === 'metrics') return '- metric: "test.metric"\n  value: "1.0"'
      return '[]'
    })
    await run()
    expect(mockSendMetrics).toHaveBeenCalledWith(
      'https://example.live.dynatrace.com',
      'my-token',
      expect.arrayContaining([
        expect.objectContaining({ metric: 'test.metric', value: '1.0' })
      ])
    )
  })

  it('sends events when a non-empty events list is provided', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'url') return 'https://example.live.dynatrace.com'
      if (name === 'token') return 'my-token'
      if (name === 'events')
        return '- title: "Test Event"\n  type: "CUSTOM_INFO"'
      return '[]'
    })
    await run()
    expect(mockSendEvents).toHaveBeenCalledWith(
      'https://example.live.dynatrace.com',
      'my-token',
      expect.arrayContaining([
        expect.objectContaining({ title: 'Test Event', type: 'CUSTOM_INFO' })
      ])
    )
  })

  it('strips trailing slash from url before sending', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'url') return 'https://example.live.dynatrace.com/'
      if (name === 'token') return 'my-token'
      if (name === 'metrics') return '- metric: "test.metric"\n  value: "1.0"'
      return '[]'
    })
    await run()
    expect(mockSendMetrics).toHaveBeenCalledWith(
      'https://example.live.dynatrace.com',
      expect.any(String),
      expect.any(Array)
    )
  })

  it('does not send metrics when metrics list is empty', async () => {
    await run()
    expect(mockSendMetrics).not.toHaveBeenCalled()
  })

  it('does not send events when events list is empty', async () => {
    await run()
    expect(mockSendEvents).not.toHaveBeenCalled()
  })

  it('sends SDLC events when a non-empty sdlc-events list is provided', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'url') return 'https://example.live.dynatrace.com'
      if (name === 'token') return 'my-token'
      if (name === 'sdlc-events')
        return "- 'event.id': 'deploy-1'\n  'event.type': 'deployment'"
      return '[]'
    })
    await run()
    expect(mockSendSdlcEvents).toHaveBeenCalledWith(
      'https://example.live.dynatrace.com',
      'my-token',
      expect.arrayContaining([
        expect.objectContaining({ 'event.id': 'deploy-1' })
      ])
    )
  })

  it('does not send SDLC events when sdlc-events list is empty', async () => {
    await run()
    expect(mockSendSdlcEvents).not.toHaveBeenCalled()
  })

  it('calls setFailed on unexpected errors', async () => {
    mockGetInput.mockImplementation(() => {
      throw new Error('unexpected input error')
    })
    await run()
    expect(mockSetFailed).toHaveBeenCalledWith('unexpected input error')
  })
})
