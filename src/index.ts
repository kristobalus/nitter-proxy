
import fastify, {
    FastifyInstance,
    FastifyListenOptions,
    FastifyReply,
    FastifyRequest,
} from "fastify"
import { PinoLoggerOptions } from "fastify/types/logger"
import { Proxy } from "./proxy"
import { Logger } from "pino"
import 'dotenv/config'

const host = process.env.HOST
const port = parseInt(process.env.PORT ?? "8080", 10)
const baseUrl = process.env.NITTER_BASE_URL
const concurrency = parseInt(process.env.CONCURRENCY ?? "1", 10)
const retryAfterMillis = parseInt(process.env.RETRY_AFTER_MILLIS ?? "5000", 10)
const maxCacheSize = parseInt(process.env.MAX_CACHE_SIZE ?? "100000", 10)
const logLevel = process.env.LOG_LEVEL ?? "debug"

const server = fastify({
    logger: {
        name: "app",
        level: logLevel,
        ...( logLevel == "trace" ? { transport: { target: 'pino-pretty' } } : {})
    } as PinoLoggerOptions
})

const log = server.log as Logger
const proxy = new Proxy(log, baseUrl, concurrency, retryAfterMillis, maxCacheSize)

server.register((fastify: FastifyInstance, opts, done) => {

    fastify.get(`/user/:username`, {},
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { username } = request.params as any
            const { status, data } = await proxy.getUser(username, { reqId: request.id })
            reply.status(status).send(data)
        });

    fastify.get(`/user/:userId/tweets`, {},
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { userId } = request.params as any
            const { cursor } = request.query as any
            const { status, data } = await proxy.getUserTweets(userId, cursor, { reqId: request.id })
            reply.status(status).send(data)
        });

    fastify.get(`/tweet/:id`, {},
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { id } = request.params as any
            const { status, data } = await proxy.getTweetById(id, { reqId: request.id })
            reply.status(status).send(data)
        });

    done()

}, { prefix: '/api' })

server.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404)
        .send({ message: `Method not found` })
})

server.setErrorHandler((err: Error, request: FastifyRequest, reply: FastifyReply) => {
    const { log } = request
    log.error(err)
    // Send error response
    reply.status(500).send({ message: `Internal server error` })
})

async function main() {
    await server.listen({ port, host } as FastifyListenOptions);
}

main().catch(err => {
    log.fatal(err)
    process.exit(1)
})
