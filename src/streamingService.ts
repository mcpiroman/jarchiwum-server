import TwitchService from './twitchService'

export interface IStreamingService{
    getStreamRechatInfo(streamId: any): Promise<{ startTime: Date; durationMs: number; }>
}

export const twitchService = new TwitchService()
