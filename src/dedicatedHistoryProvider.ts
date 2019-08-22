import fs = require('fs')
import path = require('path')

import Config from './config'
import * as Utils from './utils'
import { IPoorchatHistoryProvider, PoorchatEventType, PoorchatEvent } from './poorchatHistory';

export default class DedicatedHistoryProvider implements IPoorchatHistoryProvider{

    async getEventsInRange(timeFrom: Date, timeTo: Date, precedingMessages?: number):
        Promise<{events: PoorchatEvent[], availableTimeFrom: Date | null, availableTimeTo: Date | null}> {
        const now = new Date()
        if(timeFrom > now)
            throw new Error('from time is later than current time')
        if(timeTo > now)
            throw new Error('to time is later than current time')
        if(timeFrom > timeTo)
            throw new Error('from time is later than to time')
        
        if(Config.DEDICATED_LOGS_PATH == undefined)
            return {events: [], availableTimeFrom: null, availableTimeTo: null}
            
        precedingMessages = precedingMessages || 0
            
        let events: PoorchatEvent[] = []
        const fromDay = Utils.getDayFromDate(timeFrom)
        const toDay = Utils.getDayFromDate(timeTo)
        
        let firstFileEventsIterable: Iterable<PoorchatEvent> | null = null
        let firstFile: {day: Date, index: number} | null = null
        
        let fileIndex = 0
        let fileDay = new Date(fromDay)
        let availableTimeFrom: Date | null = null
        let availableTimeTo: Date | null = null
        for(let isFirstFile = true; fileDay <= toDay; isFirstFile = false){ 
            const nextFile = this.findNextFile(fileDay, isFirstFile ? undefined : fileIndex, 'forward', toDay)
            if(nextFile == null)
                break
                
            fileDay = nextFile.day
            fileIndex = nextFile.index
            
            const filePath = this.getLogFilePath(fileDay, fileIndex)
            const eventsIterable = await this.getEventsFromFile(filePath, fileDay, timeFrom)
            
            let reachedLast = true
            for(const event of eventsIterable){
                if(event.time > timeTo){
                    reachedLast = false
                    break
                }

                events.push(event)
                
                if(firstFile == null)
                    firstFile = nextFile
                if(firstFileEventsIterable == null)
                    firstFileEventsIterable = eventsIterable
                
                availableTimeTo = new Date(event.time)
                if(availableTimeFrom == null)
                    availableTimeFrom = new Date(event.time)
            }
                
            if(!reachedLast && Utils.isSameDay(fileDay, timeTo))
                break
        }
        
        if(precedingMessages > 0 && firstFile){
            let fileDay = new Date(firstFile.day)
            let fileIndex = firstFile.index
            let eventsIterator = firstFileEventsIterable![Symbol.iterator]()
            let gotPrecedingMessages = 0
            while(true){
                while(gotPrecedingMessages < precedingMessages){
                    const {value, done} = eventsIterator.next(true)
                    
                    if(done)
                        break
                        
                    if(value.time < timeFrom){
                        events.splice(0, 0, value)
                        
                        if([PoorchatEventType.Message, PoorchatEventType.ActionMessage, PoorchatEventType.Notice].includes(value.type))
                            gotPrecedingMessages++
                    }
                }
                
                if(gotPrecedingMessages == precedingMessages)
                    break
                
                const searchLimitDay = new Date(fromDay)
                searchLimitDay.setUTCDate(searchLimitDay.getUTCDate() - 1)
                const nextFile = this.findNextFile(fileDay, fileIndex, 'backward', searchLimitDay)
                
                if(nextFile == null)
                    break
                    
                fileDay = nextFile.day
                fileIndex = nextFile.index
                const filePath = this.getLogFilePath(fileDay, fileIndex)
                eventsIterator = (await this.getEventsFromFile(filePath, fileDay, timeFrom))[Symbol.iterator]()
            }
        }
        
        events = events.filter((event, index, arr) => { // Remove duplicated events by msgid
            if(!event.ircTags || !event.ircTags.has('msgid'))
                return true
            const msgid = event.ircTags.get('msgid')
            return arr.findIndex(e => e.ircTags != undefined && e.ircTags.get('msgid') === msgid) === index
        })
        
        return { events,
            availableTimeFrom,
            availableTimeTo
        }
    }

    private findNextFile(prevFileDay: Date, prevFileIndex: number | undefined, direction: 'forward' | 'backward', limitDay: Date): 
        {day: Date, index: number} | null {
        if(direction == 'backward' && prevFileIndex != undefined && prevFileIndex > 0){
            const fileIndex = prevFileIndex - 1
            const filePath = this.getLogFilePath(prevFileDay, fileIndex)
            
            if(!fs.existsSync(filePath))
                return null
                
            return { day: prevFileDay, index: fileIndex }
        } else if (direction == 'forward'){
            const fileIndex = prevFileIndex == undefined ? 0 : prevFileIndex + 1
            const filePath = this.getLogFilePath(prevFileDay, fileIndex)
            
            if(fs.existsSync(filePath))
                return { day: prevFileDay, index: fileIndex }
        }
        
        const day = new Date(prevFileDay)
        while(true){
            day.setUTCDate(day.getUTCDate() + (direction == 'forward' ? 1 : -1))
            if(direction == 'forward'){
                if(day > limitDay)
                    break
            } else {
                if(day < limitDay)
                    break
            }
            
            const fileIndex = direction == 'forward' ? 0 : this.getLastFileOfDayIndex(day) || -1
            if(fileIndex != -1){
                const filePath = this.getLogFilePath(day, fileIndex)
                if(fs.existsSync(filePath))
                    return  { day, index: fileIndex }
            }
        }
        
        return null
    }
    
    private getLastFileOfDayIndex(day: Date, startIndex = 0): number | null{
        for(let i = startIndex; ;i++){
            const filePath = this.getLogFilePath(day, i)
            if(!fs.existsSync(filePath))
                return i > 0 ? i - 1 : null
        }
    }
    
    private getLogFilePath(day: Date, index: number): string{
        const dateString = `${day.getUTCFullYear().toString().padStart(2, '0')}-${(day.getUTCMonth() + 1).toString().padStart(2, '0')}-${day.getUTCDate().toString().padStart(2, '0')}`
        return path.join(Config.DEDICATED_LOGS_PATH!, `${dateString}-${index}.txt`)
    }
    
    private async getEventsFromFile(filePath: string, day: Date, pivotTime: Date)
        : Promise<Iterable<PoorchatEvent>>
    {
        const file = await fs.promises.readFile(filePath, { encoding: 'utf8' , flag: 'r'})
        const lines = file.split('\n')
        
        const allEvents = <PoorchatEvent[]>lines
            .map(eventText => this.parseEvent(day, eventText))
            .filter(event => event)
        
        let pivotIndex = 0
        for(; pivotIndex < allEvents.length; pivotIndex++){
            const event = allEvents[pivotIndex]
            if(event && event.time >= pivotTime)
                break
        }
    
        return {
            *[Symbol.iterator]() {
                let index = pivotIndex
                while(index >= 0 && index < allEvents.length){
                    const backward = yield allEvents[index]
                    index += backward ? -1 : 1
                }
            }
        }
    }
    
    private parseEvent(fileDay: Date, eventText: string): PoorchatEvent | null {
        if(!eventText)
            return null
        
        const [timeStr, typeStr, ircTagsStr, content] = Utils.splitStringUpTo(eventText, ' ', 3)
        
        const [hourStr, minuteStr, secAndMilisStr]: string[] = timeStr.split(':', 3)
        const [secStr, milisStr] = secAndMilisStr.split('.')
        const time = new Date(fileDay)
        time.setUTCHours(parseInt(hourStr), parseInt(minuteStr), parseInt(secStr), parseInt(milisStr))
        
        const ircTags = Utils.parseIrcMessageTags(ircTagsStr.substring(1))
        
        const eventCommonData = {
            time,
            ircTags
        } 
        
        switch(typeStr){
            case 'msg': {
                const [userWithModes, message] = Utils.splitStringUpTo(content, ' ', 1)
                const [userModes, user] = Utils.splitStringUpTo(userWithModes, ':', 1)
                return { ...eventCommonData, 
                    type: PoorchatEventType.Message, 
                    user,
                    userModes,
                    message 
                }
            }
            case 'action': {
                const [user, message] = Utils.splitStringUpTo(content, ' ', 1)
                return { ...eventCommonData, 
                    type: PoorchatEventType.ActionMessage, 
                    message: user + " " + message
                }
            }
            case 'embed':
                return { ...eventCommonData, 
                    type: PoorchatEventType.Embed, 
                    jsonContent: content 
                }
            case 'notice':
                return { ...eventCommonData, 
                    type: PoorchatEventType.Notice, 
                    message: content
                }
            case 'title':
                return { ...eventCommonData, 
                    type: PoorchatEventType.TitleChanged, 
                    title: content
                }
            default:
                return null
                //throw new Error(`Unknown event type: ${typeStr}`)
        }
    }
}