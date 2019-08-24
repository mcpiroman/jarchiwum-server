import axios, { AxiosInstance } from 'axios'
import {IStreamingService} from './streamingService'
import Config from './config'

export default class TwitchService implements IStreamingService{
    private readonly twitchApiAxiosInstance: AxiosInstance
    private static readonly STREAM_START_CORRECTION = 6000 // In ms
    
    constructor(){
        this.twitchApiAxiosInstance = axios.create({
        baseURL: 'https://api.twitch.tv/helix',
            headers: {
                'Client-ID': Config.TWITCH_API_CLIENT_ID
            }
        })
    }
    
    async getStreamRechatInfo(streamId: string): Promise<{ startTime: Date; durationMs: number; }> {
        const videoData = await this.getVideo(streamId)
        
        const startTime = new Date(videoData.created_at)
        startTime.setTime(startTime.getTime() + TwitchService.STREAM_START_CORRECTION)
        
        const {hours, minutes, seconds} = videoData.duration.match(/^((?<hours>\d+)h)?((?<minutes>\d+)m)?((?<seconds>\d+)s)?$/).groups
        const durationMs = (parseInt(hours || 0) * 3600 + parseInt(minutes || 0) * 60 + parseInt(seconds || 0)) * 1000
        
        return { startTime: startTime, durationMs: durationMs }
    }
    
    
    private async getVideo(videoId: string): Promise<any | null>{
        return (await this.twitchApiAxiosInstance.get(`/videos?id=${videoId}`)).data.data[0]
    }
}