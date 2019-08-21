import DedicatedHistoryProvider from './DedicatedHistoryProvider'
import ServerHistoryProvider from './serverHistoryProvider'

export enum PoorchatEventType{
    Message,
    ActionMessage,
    Embed,
    /*UserModeChanged,
    UserJoins,
    UserParts,
    UserList,*/
    Notice,
    TitleChanged,
}

interface PoorchatEventBase{
    type: PoorchatEventType
    time: Date
    ircTags?: Map<string, string>
}

export type PoorchatEvent = PoorchatMessageEvent | PoorchatActionMessageEvent | PoorchatEmbedEvent | PoorchatNoticeEvent | PoorchatTitleChangedEvent

export interface PoorchatMessageEvent extends PoorchatEventBase {
    type: PoorchatEventType.Message
    user: string
    userModes?: string
    message: string
}

export interface PoorchatActionMessageEvent extends PoorchatEventBase {
    type: PoorchatEventType.ActionMessage
    message: string
}

export interface PoorchatEmbedEvent extends PoorchatEventBase {
    type: PoorchatEventType.Embed
    jsonContent: string
}

export interface PoorchatNoticeEvent extends PoorchatEventBase {
    type: PoorchatEventType.Notice
    message: string
}

export interface PoorchatTitleChangedEvent extends PoorchatEventBase {
    type: PoorchatEventType.TitleChanged
    title: string
}

export interface IPoorchatHistoryProvider{
    getEventsInRange(timeFrom: Date, timeTo: Date, precedingMessages?: number): 
        Promise<{events: PoorchatEvent[], availableTimeFrom: Date | null, availableTimeTo: Date | null}>
}

const historyProviders = [
    new DedicatedHistoryProvider(),
    new ServerHistoryProvider()
]

export async function getPoorchatEventsInRange(timeFrom: Date, timeTo: Date, precedingMessages?: number): 
    Promise<{events: PoorchatEvent[], availableTimeFrom: Date | null, availableTimeTo: Date | null}>{
    // todo: mix events form providers
    let {events, availableTimeFrom, availableTimeTo} = await historyProviders[0].getEventsInRange(timeFrom, timeTo, precedingMessages)
    
    /* if(events.length == 0){
        events = (await historyProviders[1].getEventsInRange(timeFrom, timeTo, precedingMessages)).events
    } */
    
    return {events, availableTimeFrom, availableTimeTo}
}