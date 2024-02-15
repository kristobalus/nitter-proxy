import axios from "axios"
import { AxiosInstance, AxiosRequestConfig } from "axios"
import fastq from "fastq"
import { Logger } from "pino"
import retry from "axios-retry-after"

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

    private readonly client: AxiosInstance
    private readonly queue: fastq.queueAsPromised<Job, JobResponse>

    constructor(
        private log: Logger,
        private baseUrl: string,
        private concurrency: number
    ) {
        this.queue = fastq.promise(this, this.sendRequest, this.concurrency)
        this.client = axios.create()
        this.client.interceptors.response.use(null, retry(this.client))
    }

    async getUser(username: string, options?: { reqId?: string }) {
        return await this.queue.push({
            url: `/api/user/${ username }`,
            reqId: options?.reqId
        })
    }

    async getUserTweets(userId: string, cursor?: string, options?: { reqId?: string }) {
        return await this.queue.push({
            url: `/api/user/${ userId }/tweets`,
            params: { cursor },
            reqId: options?.reqId
        })
    }

    async getTweetById(tweetId: string, options?: { reqId?: string }) {
        return await this.queue.push({
            url: `/api/tweet/${ tweetId }`,
            reqId: options?.reqId
        })
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
