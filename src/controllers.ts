import { Response, Request } from 'express';
import { getPoorchatEventsInRange } from './poorchatHistory'
import { generateRechatEventsMessage } from './rechatEventsEmitter'
import { IStreamingService, twitchService }  from './streamingService'

export async function getReplay(req: Request, res: Response, next: () => void): Promise<void>{
    const reqParams = req.params as any
    const queryParams = req.query as any

    let streamingServiceStr: string = reqParams.streamingService
    let streamId: string = reqParams.streamId
    let playerTimeFrom: string | undefined = queryParams.playerTimeFrom
    let playerTimeTo: string | undefined = queryParams.playerTimeTo
    
    let streamingService: IStreamingService
    switch(streamingServiceStr){
        case 'twitch':
            streamingService = twitchService
            break
        default:
            res.status(400).send('Unknown service: ' + streamingServiceStr)
            return
    }
    
    const { startTime: videoStartTime, durationMs: videoDurationMs } = await streamingService.getStreamRechatInfo(streamId)
    
    const eventsStartTime = new Date(videoStartTime)
    if(playerTimeFrom)
        eventsStartTime.setTime(eventsStartTime.getTime() + parseInt(playerTimeFrom))
    
    const eventsEndTime = new Date(videoStartTime)
    if(playerTimeTo)
        eventsEndTime.setTime(eventsEndTime.getTime() + parseInt(playerTimeTo))
    else
        eventsEndTime.setTime(eventsEndTime.getTime() + videoDurationMs)
    
   /*  const eventsStartTime = new Date(Date.UTC(2019,8-1,15, 12,0,0)) //new Date(Date.UTC(2019,7-1,7, 15,16,32))
    const eventsEndTime = new Date(Date.UTC(2019,8-1,15, 18,0,0)) //new Date(Date.UTC(2019,7-1,7, 17,25,0))
    const videoStartTime = eventsStartTime */
        
    const {events: poorchatEvents, availableTimeFrom, availableTimeTo} = await getPoorchatEventsInRange(eventsStartTime, eventsEndTime, 40)
    
    const result = generateRechatEventsMessage(poorchatEvents, availableTimeFrom, availableTimeTo, videoStartTime)
    res.contentType('text/plain').send(result)
    
    next()
}