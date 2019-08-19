import express = require('express')
import net = require('net')
import cors = require('cors')

import * as Controllers from './controllers'

const app = express()

app.use(cors())
app.get('/rechat/:streamingService/:streamId', Controllers.getRechatChunk)

var server = app.listen(80, 'api.jarchiwum.pl', function () {
   var host = (server.address() as net.AddressInfo).address
   var port = (server.address() as net.AddressInfo).port
   
   console.log(`Listening at http://${host}:${port}`)
})