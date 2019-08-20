import { PoorchatEvent, PoorchatEventType, PoorchatEmbedEvent, PoorchatTitleChangedEvent } from './poorchatHistory'


export function getRechatEventsMessage(poorchatEvents: PoorchatEvent[], streamStartTime: Date): string {
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
            case PoorchatEventType.TitleChanged:
                eventTypeStr = 'title'
                contentStr = poorchatEvent.title
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
        const playerTime = Math.max(poorchatEvent.time.getTime() - streamStartTime.getTime(), 0)
        eventsStr += `${playerTime} ${eventTypeStr} @${ircTagsStr} ${contentStr}\n`
    }
    
    const metadata = {
        streamStartTime: streamStartTime
    }
    
    return JSON.stringify(metadata) + '\n' + eventsStr
}