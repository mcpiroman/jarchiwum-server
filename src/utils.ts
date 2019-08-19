export function splitStringUpTo(str: string, separator: string, limit: number): string[]{
    const parts: string[] = []
    let prevSepIndex = 0
    
    for(let i = 0; i < limit; i++){
        const sepIndex = str.indexOf(separator, prevSepIndex)
        if(sepIndex == -1)
            break
            
        parts.push(str.substring(prevSepIndex, sepIndex))
        prevSepIndex = sepIndex + separator.length
    }
    
    parts.push(str.substring(prevSepIndex))
    return parts
}

export function isSameDay(d1: Date, d2: Date) {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
}

export function getDayFromDate(date: Date){
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function getReminderIfStartsWith(str: string, startsWith: string): string | null{
    if(str.startsWith(startsWith))
        return str.substring(startsWith.length)
    else
        return null
}

export function randomIntInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function rangeUnitValue(unitValue: number, min: number, max: number): number {
    return unitValue * (max - min) + min;
}

export function clamp(val: number, min: number, max: number): number{
    return Math.min(max, Math.max(min, val));
}

export function parseIrcMessageTags(ircTagsStr: string): Map<string, string>{
    return new Map(ircTagsStr
        .split(';')
        .map(keyValuePair => <[string, string]>splitStringUpTo(keyValuePair, '=', 1)))
}