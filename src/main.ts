import * as core from '@actions/core'
import * as dd from './dynatrace'


async function run(): Promise<void> {
  try {
    const url: string = core.getInput('url')
    core.info(url) 
    core.info("Hey ho lets go!") 
    core.info(core.getInput('metrics')) 
    
    core.info(core.getInput('events')) 
    

    
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
