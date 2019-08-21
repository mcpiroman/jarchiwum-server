import express = require('express')
import net = require('net')
import cors = require('cors')
import fs = require('fs')
import path = require('path')

import { getPoorchatEventsInRange } from './poorchatHistory'
import { generateRechatEventsMessage } from './rechatEventsEmitter'
import { twitchService }  from './streamingService'

import * as Controllers from './controllers'

const app = express()

app.use(cors())
app.get('/rechat/:streamingService/:streamId', Controllers.getRechatChunk)

var server = app.listen(80, 'api.jarchiwum.pl', function () {
   var host = (server.address() as net.AddressInfo).address
   var port = (server.address() as net.AddressInfo).port
   
   console.log(`Listening at http://${host}:${port}`)
})

/* saveRequestsAsStaticFiles()
   .then(() => console.log('DONE'))
   .catch(e => console.error(e))
 */
async function saveRequestsAsStaticFiles(){
   const targetDir = "F:\\poorchatLogs\\rechatStaticTwitch"
   const streamIds = ['469808797','469806413','469444398','468945667','467998136','467617898','467475087','467150755','466601376','466188483','466071030','464889335','464867096','464842950','461624728','461549710','461542514','461415190','460990356','460547813']
   
   for(const streamId of streamIds){
      const outputFilePath = path.join(targetDir, streamId)
      const { startTime: videoStartTime, durationMs: videoDurationMs } = await twitchService.getStreamRechatInfo(streamId)
      
      const eventsStartTime = new Date(videoStartTime)
      const eventsEndTime = new Date(videoStartTime)
      eventsEndTime.setTime(eventsEndTime.getTime() + videoDurationMs)
      
      const {events: poorchatEvents, availableTimeFrom, availableTimeTo} = await getPoorchatEventsInRange(eventsStartTime, eventsEndTime, 40)
      const result = generateRechatEventsMessage(poorchatEvents, availableTimeFrom, availableTimeTo, videoStartTime)
      
      await fs.promises.writeFile(outputFilePath, result, {encoding:'utf8'})
      console.log('Wrote ' + outputFilePath)
   }
}