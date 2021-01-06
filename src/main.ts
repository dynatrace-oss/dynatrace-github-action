import * as core from '@actions/core'
//import {wait} from './wait'

async function run(): Promise<void> {
  try {
    const url: string = core.getInput('url')
    core.debug(url) 
    
    

    
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
