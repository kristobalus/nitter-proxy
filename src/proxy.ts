// noinspection TypeScriptUnresolvedReference

import axios from "axios"
import { AxiosInstance, AxiosRequestConfig } from "axios"
import fastq from "fastq"
import { Logger } from "pino"
import retry from "axios-retry-after"
import { LRUCache } from 'lru-cache'

const GET_USER_TTL_MS = 3600000 // 3600 seconds
const GET_TWEETS_TTL_MS = 60000 // 60 seconds
const GET_TWEET_TTL_MS = 60000 // 60 seconds

export interface Job {
    reqId: string
    url: string
    params?: Record<string, any>
}

export interface JobResponse {
    status: number,
    data: any
}

export class Proxy {

    private readonly cache: LRUCache<string, JobResponse>
    private readonly client: AxiosInstance
    private readonly queue: fastq.queueAsPromised<Job, JobResponse>

    constructor(
        private log: Logger,
        private baseUrl: string,
        private concurrency: number,
        private retryAfterMillis: number
    ) {
        this.cache =  new LRUCache({ max: 10000 })
        this.queue = fastq.promise(this, this.sendRequest, this.concurrency)
        this.client = axios.create()
        // this.client.interceptors.response.use(null, retry(this.client, {
        //     // Determine when we should attempt to retry
        //     isRetryable (error) {
        //         log.debug({ status: error.response?.status, headers: error.response?.headers }, 'checking retryable')
        //         return (
        //             error.response && error.response.status === 429
        //             // Use X-Retry-After rather than Retry-After, and cap retry delay at 60 seconds
        //             // && error.response.headers['x-retry-after'] && error.response.headers['x-retry-after'] <= 60
        //         )
        //     },
        //     // Customize the wait behavior
        //     wait (error) {
        //         log.debug({ status: error.response?.status, headers: error.response?.headers }, 'waiting for retry')
        //         return new Promise(
        //             // Use X-Retry-After rather than Retry-After
        //             // resolve => setTimeout(resolve, error.response.headers['x-retry-after'])
        //             resolve => setTimeout(resolve, retryAfterMillis)
        //         )
        //     }
        // }))
    }

    async getUser(username: string, options?: { reqId?: string }) {
        const key = `usernames:${username}`

        if ( this.cache.has(key)) {
            return this.cache.get(key)
        }

        const result = await this.queue.push({
            url: `/api/user/${ username }`,
            reqId: options?.reqId
        })

        this.cache.set(key, result, { ttl: GET_USER_TTL_MS })

        return result
    }

    async getUserTweets(userId: string, cursor?: string, options?: { reqId?: string }) {
        const key = `users:${userId}:tweets`

        if ( this.cache.has(key) ) {
            return this.cache.get(key)
        }

        const result = await this.queue.push({
            url: `/api/user/${ userId }/tweets`,
            params: { cursor },
            reqId: options?.reqId
        })

        this.cache.set(key, result, { ttl: GET_TWEETS_TTL_MS })

        return result
    }

    async getTweetById(tweetId: string, options?: { reqId?: string }) {
        const key = `tweets:${tweetId}`

        if ( this.cache.has(key) ) {
            return this.cache.get(key)
        }

        const result = await this.queue.push({
            url: `/api/tweet/${ tweetId }`,
            reqId: options?.reqId
        })

        this.cache.set(key, result, { ttl: GET_TWEET_TTL_MS })

        return result
    }

    private async sendRequest(job: Job): Promise<any> {

        const { reqId, url, params } = job

        let config = {
            url,
            method: "get",
            baseURL: this.baseUrl,
            params,
        } as AxiosRequestConfig

        this.log.trace({ config, reqId: reqId }, 'sending request to nitter')

        const response = await this.client.request(config)

        this.log.trace({
            status: response.status,
            data: response.data,
            reqId: reqId
        }, 'nitter response')

        return {
            status: response.status,
            data: response.data,
        } as JobResponse
    }
}
