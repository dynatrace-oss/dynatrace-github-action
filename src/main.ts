import * as core from '@actions/core'
//import {wait} from './wait'

async function run(): Promise<void> {
  try {
    const url: string = core.getInput('url')
    core.info(url) 
    core.info("Hey ho lets go!") 
    
    

    
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
