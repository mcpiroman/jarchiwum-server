import fs = require('fs')
import path = require('path')
import seedrandom = require('seedrandom')

import Config from './config'
import * as Utils from './utils'
import { IPoorchatHistoryProvider, PoorchatEventType, PoorchatEvent } from './poorchatHistory';

export default class ServerHistoryProvider implements IPoorchatHistoryProvider{
    async getEventsInRange(timeFrom: Date, timeTo: Date, precedingMessages?: number): 
        Promise<{events: PoorchatEvent[], availableTimeFrom: Date | null, availableTimeTo: Date | null}> {
        const now = new Date()
        if(timeFrom > now)
            throw new Error('from time is later than current time')
        if(timeTo > now)
            throw new Error('to time is later than current time')
        if(timeFrom > timeTo)
            throw new Error('from time is later than to time')
        
        if(Config.POORCHAT_LOGS_PATH == undefined)
            return {events: [], availableTimeFrom: null, availableTimeTo: null}
            
        precedingMessages = precedingMessages || 0
            
        const events: PoorchatEvent[] = []
        const fromDay = Utils.getDayFromDate(timeFrom)
        const toDay = Utils.getDayFromDate(timeTo)
        
        const fileDay = new Date(fromDay)
        let availableTimeFrom: Date | null = null
        let availableTimeTo: Date | null = null
        while(true){
            const filePath = this.getLogFilePath(fileDay)
            if(fs.existsSync(filePath)){
                const {events: eventsFromFile, gotPrecedingMessages: _} = await this.getEventsRangeInFile(filePath, fileDay, timeFrom, timeTo, 0)
                events.push(...eventsFromFile)
                
                if(availableTimeFrom == null)
                    availableTimeFrom = new Date(fileDay)
                    
                availableTimeTo = new Date(fileDay)
                availableTimeTo.setUTCDate(availableTimeTo.getUTCDate() + 1)
            }
            
            if(Utils.isSameDay(fileDay, toDay))
                break
                
            fileDay.setUTCDate(fileDay.getUTCDate() + 1)
        }
        
        this.randomizeEventTimes(events)
        
        return { events: events,
            availableTimeFrom: availableTimeFrom,
            availableTimeTo: availableTimeTo
        }
    }
    
    private getLogFilePath(day: Date): string{
        const dateString = `${day.getUTCFullYear().toString().padStart(2, '0')}-${(day.getUTCMonth() + 1).toString().padStart(2, '0')}-${day.getUTCDate().toString().padStart(2, '0')}`
        return path.join(Config.POORCHAT_LOGS_PATH!, `${dateString}.log`)
    }
    
    private async getEventsRangeInFile(filePath: string, day: Date, timeFrom: Date, timeTo: Date, precedingMessages: number): Promise<{events: PoorchatEvent[], gotPrecedingMessages: number}>{
        const file = await fs.promises.readFile(filePath, { encoding: 'utf8' , flag: 'r'})
        const lines = file.split('\n')
        
        if(lines.length == 0)
            return { events: [], gotPrecedingMessages: 0 }

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

        const events = allEvents.slice(startIndex, endIndex)
        return {events: events, gotPrecedingMessages: gotPrecedingMessages}      
    }
    
    private parseEvent(fileDay: Date, eventText: string): PoorchatEvent | null{
        if(!eventText)
            return null
            
        const [eventTimeStr, eventSender, eventContent] = Utils.splitStringUpTo(eventText, ' ', 2)
        
        const eventHourStr = eventTimeStr.substr(1, 2)
        const eventMinuteStr = eventTimeStr.substr(4, 2)
        const eventSecondStr = eventTimeStr.substr(7, 2)
        const eventTime = new Date(fileDay)
        eventTime.setUTCHours(parseInt(eventHourStr), parseInt(eventMinuteStr), parseInt(eventSecondStr))
        
        const eventCommonData = {
            time: eventTime
        } 
        
        if(eventSender == '***'){
            let content: string | null
            
            content = Utils.getReminderIfStartsWith(eventContent, 'Joins: ')
            if(content != null){
                return null
            }
            
            content = Utils.getReminderIfStartsWith(eventContent, 'Parts: ')
            if(content != null){
                return null
            }
            
            content = Utils.getReminderIfStartsWith(eventContent, 'irc.poorchat.net sets mode: ')
            if(content != null){
                return null
            }
            
            return { ...eventCommonData, 
                type: PoorchatEventType.Notice,
                message: eventContent
            }
        } else if(eventSender == '*'){
            return { ...eventCommonData, 
                type: PoorchatEventType.ActionMessage, 
                message: eventContent
            }  
        } else {
            const user = eventSender.substring(1, eventSender.length - 1)
            return { ...eventCommonData, 
                type: PoorchatEventType.Message, 
                user: user,
                message: eventContent 
            }
        }
    }
    
    private randomizeEventTimes(events: PoorchatEvent[]){
        for(let eventsInSecondStartIndex = 0; eventsInSecondStartIndex < events.length;){
            let eventsInSecondEndIndex = eventsInSecondStartIndex
            for(; eventsInSecondEndIndex < events.length; eventsInSecondEndIndex++){
                if(events[eventsInSecondEndIndex].time.getTime() != events[eventsInSecondStartIndex].time.getTime())
                    break
            }
            
            const eventsInSecondCount = eventsInSecondEndIndex - eventsInSecondStartIndex
            const relativeEventSecondParts: number[] = []
            const rng = seedrandom(events[eventsInSecondStartIndex].time.toString());
            for(let i = 0; i < eventsInSecondCount; i++){
                relativeEventSecondParts.push(rng.double())
            }
            
            let lastNewEventMilliseconds = 0
            for(let i = 0; i < eventsInSecondCount; i++){
                lastNewEventMilliseconds += relativeEventSecondParts[i] / eventsInSecondCount * 1000
                events[eventsInSecondStartIndex + i].time.setUTCMilliseconds(lastNewEventMilliseconds)                
            }
            
            eventsInSecondStartIndex = eventsInSecondEndIndex
        }
    }
}