/*
Copyright 2024 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

import * as core from '@actions/core'
import * as yaml from 'js-yaml'

import { Metric, Event } from './dynatrace'
import * as dt from './dynatrace'

export async function run(): Promise<void> {
  try {
    const url: string = core.getInput('url').replace(/\/$/, '')
    const token: string = core.getInput('token')

    // -- metrics
    const mStr = core.getInput('metrics')
    core.info(mStr)
    if (mStr.length > 5) {
      const metrics = yaml.load(mStr) as Metric[]
      dt.sendMetrics(url, token, metrics)
    }

    // -- events
    const eStr = core.getInput('events')
    core.info(eStr)
    if (eStr.length > 5) {
      const events = yaml.load(eStr) as Event[]
      dt.sendEvents(url, token, events)
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
