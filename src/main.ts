import fs = require('fs')
import path = require('path')

import {run as runServer} from './server'
import { getPoorchatEventsInRange } from './poorchatHistory'
import { generateRechatEventsMessage } from './rechatEventsEmitter'
import { twitchService }  from './streamingService'
import { arch } from 'os';

if(process.argv.length > 2) {
   saveRequestsAsStaticFiles(process.argv[2], process.argv.slice(3))
} else {
   runServer()
}


async function saveRequestsAsStaticFiles(targetDir: string, streamIds: string[]){
   for(const streamId of streamIds){
      const outputFilePath = path.join(targetDir, streamId)
      const { startTime: streamStartTime, durationMs: streamDurationMs } = await twitchService.getStreamRechatInfo(streamId)
      
      const eventsStartTime = new Date(streamStartTime)
      const eventsEndTime = new Date(streamStartTime)
      eventsEndTime.setTime(eventsEndTime.getTime() + streamDurationMs)
      
      const {events: poorchatEvents, availableTimeFrom, availableTimeTo} = await getPoorchatEventsInRange(eventsStartTime, eventsEndTime, 40)
      const result = generateRechatEventsMessage(poorchatEvents, availableTimeFrom, availableTimeTo, streamStartTime)
      
      await fs.promises.writeFile(outputFilePath, result, {encoding:'utf8'})
      console.log('Wrote ' + outputFilePath)
   }
}