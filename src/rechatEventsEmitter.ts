import { PoorchatEvent, PoorchatEventType, PoorchatEmbedEvent, PoorchatTopicChangedEvent } from './poorchatHistory'


export function generateRechatEventsMessage(poorchatEvents: PoorchatEvent[], eventsAvailableFrom: Date | null, eventsAvailableTo: Date | null, streamStartTime: Date): string {
    let eventsStr = ''
    
    for(const poorchatEvent of poorchatEvents){
        let eventTypeStr: string
        let contentStr: string
        
        switch(poorchatEvent.type){
            case PoorchatEventType.Message:
                eventTypeStr = 'msg'
                contentStr = (poorchatEvent.userModes || '') + ':' + poorchatEvent.user + ' ' + poorchatEvent.message
                break
            case PoorchatEventType.ActionMessage:
                eventTypeStr = 'action'
                contentStr = poorchatEvent.message
                break
            case PoorchatEventType.Embed:
                eventTypeStr = 'embed'
                contentStr = poorchatEvent.jsonContent
                break
            case PoorchatEventType.Notice:
                eventTypeStr = 'notice'
                contentStr = poorchatEvent.message
                break
            case PoorchatEventType.TopicChanged:
                eventTypeStr = 'topic'
                contentStr = poorchatEvent.topic
                break
            default:
                return assertNever(poorchatEvent)
                
                function assertNever(x: never): never {
                    throw new Error('Unexpected poorchat event: ' + x);
                }
        }
        
        const ircTagsStr = [...(poorchatEvent.ircTags || new Map()).entries()]
            .map(keyValuePair => keyValuePair[0] + '=' + keyValuePair[1])
            .join(';')
        eventsStr += `${toPlayerTime(poorchatEvent.time)} ${eventTypeStr} @${ircTagsStr} ${contentStr}\n`
        
        
    }
    
    const metadata = {
        streamStartTime: streamStartTime,
        availableFrom: eventsAvailableFrom ? toPlayerTime(eventsAvailableFrom) : null,
        availableTo: eventsAvailableTo ? toPlayerTime(eventsAvailableTo) : null
    }
    
    return JSON.stringify(metadata) + '\n' + eventsStr
    
    function toPlayerTime(realTime: Date) {
        return Math.max(realTime.getTime() - streamStartTime.getTime(), 0)
    }
}