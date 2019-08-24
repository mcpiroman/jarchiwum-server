import express = require('express')
import net = require('net')
import cors = require('cors')

import * as Controllers from './controllers'

export function run() {
    const app = express()

    app.use(cors())
    app.get('/replay/:streamingService/:streamId', Controllers.getReplay)

    const server = app.listen(80, 'api.jarchiwum.pl', function () {
        const host = (server.address() as net.AddressInfo).address
        const port = (server.address() as net.AddressInfo).port
        
        console.log(`Listening at http://${host}:${port}`)
    })
}