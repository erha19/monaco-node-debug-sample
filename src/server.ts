import * as ws from "ws";
import * as http from "http";
import * as url from "url";
import * as net from "net";
import * as express from "express";
import * as rpc from "vscode-ws-jsonrpc";
import { launch } from "./json-server-launcher";
import { DebugSession } from './node/debugSession'

process.on('uncaughtException', function (err: any) {
    console.error('Uncaught Exception: ', err.toString());
    if (err.stack) {
        console.error(err.stack);
    }
});

// create the express application
const app = express();
const port = 3001;
// server the static content, i.e. index.html
app.use(express.static(__dirname));
// start the server
const server = app.listen(port);
// create the web socket
const lspWs = new ws.Server({
    noServer: true,
    perMessageDeflate: false
});
const dapWs = new ws.Server({
    noServer: true,
    perMessageDeflate: false
});


server.on('upgrade', (request: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    const pathname = request.url ? url.parse(request.url).pathname : undefined;
    if (pathname === '/lsp') {
        lspWs.handleUpgrade(request, socket, head, webSocket => {
            const socket: rpc.IWebSocket = {
                send: content => webSocket.send(content, error => {
                    if (error) {
                        throw error;
                    }
                }),
                onMessage: cb => webSocket.on('message', cb),
                onError: cb => webSocket.on('error', cb),
                onClose: cb => webSocket.on('close', cb),
                dispose: () => webSocket.close()
            };
            // launch the server when the web socket is opened
            if (webSocket.readyState === webSocket.OPEN) {
                launch(socket);
            } else {
                webSocket.on('open', () => {
                    launch(socket);
                });
            }
        });
    } else if (pathname === '/dap') {
        dapWs.handleUpgrade(request, socket, head, webSocket => {
            const socket: rpc.IWebSocket = {
                send: content => webSocket.send(content, error => {
                    if (error) {
                        throw error;
                    }
                }),
                onMessage: cb => webSocket.on('message', cb),
                onError: cb => webSocket.on('error', cb),
                onClose: cb => webSocket.on('close', cb),
                dispose: () => webSocket.close()
            };
            // launch the debugSession when the web socket is opened
            if (webSocket.readyState === webSocket.OPEN) {
                new DebugSession(socket);
            } else {
                webSocket.on('open', () => {
                    new DebugSession(socket);
                });
            }
        });
    }
})

console.log(`visit http://localhost:${port}/`)