import * as core from '@actions/core'
import * as d from './dynatrace'
import * as yaml from 'js-yaml'

async function run(): Promise<void> {
  try {
    const url: string = core.getInput('url')
    core.info(url) 
    core.info("Hey ho lets go!") 
    core.info(core.getInput('metrics')) 
    const metrics = yaml.load(core.getInput('metrics')) as d.Metric[];
    
    core.info(core.getInput('events')) 
    

    
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
