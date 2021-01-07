import * as core from '@actions/core'
import * as d from './dynatrace'
import * as yaml from 'js-yaml'

async function run(): Promise<void> {
  try {
    const url: string = core.getInput('url')
    const token: string = core.getInput('token')

    const metrics = yaml.load(core.getInput('metrics')) as d.Metric[]
    d.sendMetrics(url, token, metrics)

    const events = yaml.load(core.getInput('events')) as d.Event[]
    d.sendEvents(url, token, events)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
