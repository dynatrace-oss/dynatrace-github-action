import * as core from '@actions/core'
import * as d from './dynatrace'
import * as yaml from 'js-yaml'

async function run(): Promise<void> {
  try {
    const url: string = core.getInput('url');
    const token: string = core.getInput('token');

    const mStr = core.getInput('metrics');
    core.info(mStr)
    if(mStr.length > 5) {
      const metrics = yaml.load(mStr) as d.Metric[];
      d.sendMetrics(url, token, metrics);
    }
    
    const eStr = core.getInput('events');
    core.info(eStr)
    if(eStr.length > 5) {
      const events = yaml.load(eStr) as d.Event[];
      d.sendEvents(url, token, events);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run()
