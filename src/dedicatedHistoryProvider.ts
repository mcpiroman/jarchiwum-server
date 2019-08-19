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
            
        const events: PoorchatEvent[] = []
        const fromDay = Utils.getDayFromDate(timeFrom)
        const toDay = Utils.getDayFromDate(timeTo)
        
        let fileIndex = 0
        let fileDay = new Date(fromDay)
        let firstFilePrecedingMessages: number | null = null
        let availableTimeFrom: Date | null = null
        let availableTimeTo: Date | null = null
        for(let isFirstFile = true; fileDay <= toDay; isFirstFile = false){ 
            const nextFile = this.findNextFile(fileDay, isFirstFile ? undefined : fileIndex, 'forward', toDay)
            if(nextFile == null)
                break
        
            fileDay = nextFile.day
            fileIndex = nextFile.index
            
            const filePath = this.getLogFilePath(fileDay, fileIndex)
            const {events: eventsFromFile, 
                reachedLast, 
                gotPrecedingMessages, 
                availableTimeFrom: fileAvailableTimeFrom, 
                availableTimeTo: fileAvailableTimeTo 
            } = await this.getEventsRangeInFile(filePath, fileDay, timeFrom, timeTo, firstFilePrecedingMessages == null ? precedingMessages : 0)
            
            events.push(...eventsFromFile)
            if(firstFilePrecedingMessages == null)
                firstFilePrecedingMessages = parseInt(gotPrecedingMessages.toString()) // Hack to bypass TS bug
            
            if(availableTimeFrom == null)
                availableTimeFrom = fileAvailableTimeFrom
            availableTimeTo = fileAvailableTimeTo
                
            if(!reachedLast && Utils.isSameDay(fileDay, timeTo))
                break
        }
        
        if(firstFilePrecedingMessages || 0 < precedingMessages){
            
        }
        
        return { events,
            availableTimeFrom,
            availableTimeTo
        }
    }

    private findNextFile(prevFileDay: Date, prevFileIndex: number | undefined, direction: 'forward' | 'backwards', limitDay: Date): 
        {day: Date, index: number} | null {
        if(direction == 'backwards' && prevFileIndex != undefined && prevFileIndex > 0){
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
    
    private async getEventsRangeInFile(filePath: string, day: Date, timeFrom: Date, timeTo: Date, precedingMessages: number): 
        Promise<{events: PoorchatEvent[], availableTimeFrom: Date | null, availableTimeTo: Date | null, reachedFirst: boolean, reachedLast: Boolean, gotPrecedingMessages: number}>
    {
        const file = await fs.promises.readFile(filePath, { encoding: 'utf8' , flag: 'r'})
        const lines = file.split('\n')
        
        if(lines.length == 0)
            return { events: [],
                availableTimeFrom: null,
                availableTimeTo: null,
                reachedFirst: true, 
                reachedLast: true, 
                gotPrecedingMessages: 0
            }

        const allEvents = <PoorchatEvent[]>lines
            .map(eventText => this.parseEvent(day, eventText))
            .filter(event => event)
            
        let startIndex = 0
        for(; startIndex < allEvents.length; startIndex++){
            const event = allEvents[startIndex]
            if(event && event.time >= timeFrom)
            break
        }
        
        let endIndex = startIndex
        for(; endIndex < allEvents.length; endIndex++){
            const event = allEvents[endIndex]
            if(event && event.time > timeTo)
                break
        }
        
        let gotPrecedingMessages = 0
        for(; startIndex >= 0 && gotPrecedingMessages < precedingMessages; startIndex--){
            const event = allEvents[endIndex]
            if(event && event.type == PoorchatEventType.Message)
                gotPrecedingMessages++
        }

        const events = allEvents
            .slice(startIndex, endIndex)
            .filter((event, index, arr) => { // Remove duplicated events by msgid
                if(!event.ircTags || !event.ircTags.has('msgid'))
                    return true
                const msgid = event.ircTags.get('msgid')
                return arr.findIndex(e => e.ircTags != undefined && e.ircTags.get('msgid') === msgid) === index
            })
            
        return {events,
            availableTimeFrom: allEvents.length == 0 ? null : allEvents[0].time,
            availableTimeTo: allEvents.length == 0 ? null : allEvents[allEvents.length - 1].time,
            reachedFirst: startIndex == 0, 
            reachedLast: endIndex == allEvents.length,
            gotPrecedingMessages
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