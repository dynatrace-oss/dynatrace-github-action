/*
Copyright 2024 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

import * as core from '@actions/core'
import * as yaml from 'js-yaml'

import { Metric, Event, SdlcEvent } from './dynatrace'
import * as dt from './dynatrace'

export async function run(): Promise<void> {
  try {
    const url: string = core.getInput('url').replace(/\/$/, '')
    const token: string = core.getInput('token')

    if (!url) {
      core.setFailed('Input "url" is required but was not provided.')
      return
    }
    if (!token) {
      core.setFailed('Input "token" is required but was not provided.')
      return
    }

    core.setSecret(token)

    // -- metrics
    const mStr = core.getInput('metrics')
    core.info(mStr)
    const metrics = yaml.load(mStr) as Metric[]
    if (Array.isArray(metrics) && metrics.length > 0) {
      await dt.sendMetrics(url, token, metrics)
    }

    // -- events
    const eStr = core.getInput('events')
    core.info(eStr)
    const events = yaml.load(eStr) as Event[]
    if (Array.isArray(events) && events.length > 0) {
      await dt.sendEvents(url, token, events)
    }

    // -- sdlc events
    const sdlcStr = core.getInput('sdlc-events')
    core.info(sdlcStr)
    const sdlcEvents = yaml.load(sdlcStr) as SdlcEvent[]
    if (Array.isArray(sdlcEvents) && sdlcEvents.length > 0) {
      await dt.sendSdlcEvents(url, token, sdlcEvents)
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
