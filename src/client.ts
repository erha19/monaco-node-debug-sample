import { listen, MessageConnection } from 'vscode-ws-jsonrpc';
import {
    MonacoLanguageClient, CloseAction, ErrorAction,
    MonacoServices, createConnection
} from 'monaco-languageclient';
import normalizeUrl = require('normalize-url');
import { DebugProtocol } from 'vscode-debugprotocol'
import * as path from 'path'

const ReconnectingWebSocket = require('reconnecting-websocket');

// register Monaco languages
monaco.languages.register({
    id: 'json',
    extensions: ['.json', '.bowerrc', '.jshintrc', '.jscsrc', '.eslintrc', '.babelrc'],
    aliases: ['JSON', 'json'],
    mimetypes: ['application/json'],
});

// create Monaco editor
// TODO：Get source conten from file '../index.js'
const value = `let a = 'welcome';
console.log(a);
debugger;
console.log(b);`;

const editor = monaco.editor.create(document.getElementById("container")!, {
    model: monaco.editor.createModel(value, 'javascript', monaco.Uri.parse('inmemory://index.js')),
    glyphMargin: true,
    lightbulb: {
        enabled: true
    }
});

// install Monaco language client services
MonacoServices.install(editor);

let timer:any = null
let seq = 0;
let breakpoints:any[] = []
let evalMap = new Map()

editor.onMouseDown((e) => {
    timer && clearTimeout(timer)
    timer = setTimeout(() => {
        if (e.target.element.className === 'breakpoint') {
            let line = e.target.position.lineNumber
            e.target.element.parentElement!.removeChild(e.target.element)
            breakpoints.splice(breakpoints.indexOf(line), 1)
        }
        // If type === breakpoint
        else if (e.target.type === 2) {
            let breakpointElement = document.createElement('div');
            let breakpointBodyElement = document.createElement('div');
            breakpointBodyElement.setAttribute('style', `left:0; top: ${0 + (e.target.position.lineNumber - 1) * 18}px; width:64px; height: 18px; cursor: pointer; position: absolute;`);
            breakpointElement.setAttribute('style', "left:5px; top:4px;width:10px;height:10px;position: absolute;background:red;border-radius: 5px;cursor: pointer;");
            breakpointBodyElement.setAttribute('class', "breakpoint");
            breakpointElement.setAttribute('class', "breakpoint");
            breakpointBodyElement.appendChild(breakpointElement)
            e.target.element.parentElement!.appendChild(breakpointBodyElement)
            breakpoints.push(e.target.position.lineNumber)
        }
    }, 100)
})

const $evaluateBtn:any = document.querySelector('#evaluate');
const $exprInput:any = document.querySelector('#expr');

$evaluateBtn!.addEventListener('click', () => {
    const evaluateEvent: any = {
        seq: seq++,
        type: 'request',
        command: 'evaluate',
        arguments: {
            expression: $exprInput!.value, 
            frameId: defaultFrameId,
            context: "repl"
        }
    }
    evalMap.set(seq-1, (data:any) => {
        $output!.innerHTML  += `[Eval] ${data!.result} </br>`
    })
    dapWebSocket.send(JSON.stringify(evaluateEvent))
})

const $runBtn:any = document.querySelector('#run');

$runBtn!.addEventListener('click', () => {
    const InitializeEvent: any = {
        seq: seq++,
        type: 'request',
        command: 'initialize',
        arguments: {"clientID":"vscode","clientName":"Code - OSS Dev","adapterID":"node2","pathFormat":"path","linesStartAt1":true,"columnsStartAt1":true,"supportsVariableType":true,"supportsVariablePaging":true,"supportsRunInTerminalRequest":true,"locale":"zh-cn"}
        
    }
    dapWebSocket.send(JSON.stringify(InitializeEvent))
})

const $nextBtn:any = document.querySelector('#next');

$nextBtn!.addEventListener('click', () => {
    const nextEvent: any = {
        seq: seq++,
        type: 'request',
        command: 'next',
        arguments: {
            threadId: defaultThreadId
        }
    }
    dapWebSocket.send(JSON.stringify(nextEvent))
})

const $stepInBtn:Element|null = document.querySelector('#stepIn');

$stepInBtn!.addEventListener('click', (e) => {
    const stepInEvent: any = {
        seq: seq++,
        type: 'request',
        command: 'stepIn',
        arguments: {
            threadId: defaultThreadId
        }
    }
    dapWebSocket.send(JSON.stringify(stepInEvent))
})

const $stepOutBtn:Element|null = document.querySelector('#stepOut');

$stepOutBtn!.addEventListener('click', (e) => {
    const stepOutEvent: any = {
        seq: seq++,
        type: 'request',
        command: 'stepOut',
        arguments: {
            threadId: defaultThreadId
        }
    }
    dapWebSocket.send(JSON.stringify(stepOutEvent))
})

const $continueBtn:Element|null = document.querySelector('#continue');

$continueBtn!.addEventListener('click', (e) => {
    const continueEvent: any = {
        seq: seq++,
        type: 'request',
        command: 'continue',
        arguments: {
            threadId: defaultThreadId
        }
    }
    dapWebSocket.send(JSON.stringify(continueEvent))
})

const $restartBtn:Element|null = document.querySelector('#restart');

$restartBtn!.addEventListener('click', (e) => {
    restart = true
    const restartEvent: any = {
        seq: seq++,
        type: 'request',
        command: 'terminate',
        arguments: {
            restart:true
        }
    }
    dapWebSocket.send(JSON.stringify(restartEvent))
})

const $output:Element|null = document.querySelector('.output');

const $threads:Element|null = document.querySelector('.threads .body');
const $callstack:Element|null = document.querySelector('.callstack .body');


// create the web socket
const lspurl = createUrl('/lsp')
const lspWebSocket:any = createWebSocket(lspurl);

const dapurl = createUrl('/dap')
const dapWebSocket:any = createWebSocket(dapurl);

let root:any
let excutedThreadsPid:any
let defaultThreadId:any
let restart: boolean
let isDebugging:boolean = false
let defaultFrameId:any 

dapWebSocket.addEventListener('open', () => {
    let outputSeq = 0
    dapWebSocket.addEventListener('message', (message:any) => {
        message = JSON.parse(message.data)
        console.log('client recive:', message)
        if (message.type === 'event') {
            if (message.event === 'output') {
                $output!.innerHTML += `[${outputSeq++}] ${message.body.output}</br>`
            } else if (message.event === 'initialized') {
                const getProcessPidMessage: any = {
                    seq: seq++,
                    command:"evaluate",
                    type:"request",
                    arguments: {expression:"process.pid"}
                }
                dapWebSocket.send(JSON.stringify(getProcessPidMessage))
                evalMap.set(seq-1, (data:any) => {
                    const setExceptionBreakpointsMessage:any = {
                        seq: seq++,
                        command:"setExceptionBreakpoints",
                        type:"request",
                        arguments: {
                            filters: []
                        }
                    }
                    dapWebSocket.send(JSON.stringify(setExceptionBreakpointsMessage))
                    defaultThreadId = data.result
                })
                isDebugging = true
            }  else if (message.event === 'terminated') {
                if (restart) {
                    const InitializeEvent: any = {
                        seq: seq++,
                        type: 'request',
                        command: 'initialize',
                        arguments: {"clientID":"vscode","clientName":"Code - OSS Dev","adapterID":"node2","pathFormat":"path","linesStartAt1":true,"columnsStartAt1":true,"supportsVariableType":true,"supportsVariablePaging":true,"supportsRunInTerminalRequest":true,"locale":"zh-cn"}
                        
                    }
                    dapWebSocket.send(JSON.stringify(InitializeEvent))
                    restart = false
                } else {
                    isDebugging = false
                    $output!.innerHTML += `[End] Debug session teminate</br>`
                    $threads!.innerHTML = ''
                    $callstack!.innerHTML = ''
                }
            }
            
        } else if (message.type === 'response') {
            if (message.command === 'initialize') {
                root = message.body.cwd
                // send launch command
                const args = {
                    type:"node2",
                    request:"launch",
                    name:"Launch Program",
                    program:`${path.join(root, 'index.js')}`,
                    cwd: root
                };
                const launchMessage: DebugProtocol.LaunchRequest = {
                    seq: seq++,
                    command: 'launch',
                    type:"request",
                    arguments: <DebugProtocol.LaunchRequestArguments>args,
                }
                dapWebSocket.send(JSON.stringify(launchMessage))
            } else if (message.command === 'launch') {
                // send loadedSources command
                const loadMessage: any = {
                    seq: seq++,
                    command:"loadedSources",
                    type:"request"
                }
                dapWebSocket.send(JSON.stringify(loadMessage))
            } else if (message.command === 'loadedSources') {
                // send breakpoint command
                const breakpointMessage: any = {
                    seq: seq++,
                    command:"setBreakpoints",
                    type:"request",
                    arguments: {
                        source: {
                            name: 'index.js',
                            path: path.join(<string>root, 'index.js'),
                        },
                        lines: breakpoints,
                        breakpoints: breakpoints.map(bp => {
                            return {line: bp}
                        }),
                        sourceModified: false
                    }
                }
                dapWebSocket.send(JSON.stringify(breakpointMessage))
            } else if (message.command === 'evaluate') {
                evalMap.get(message.request_seq)(message.body)
            } else if (message.command === 'setExceptionBreakpoints') {
                const configDoneMessage:any = {
                    seq: seq++,
                    command:"configurationDone",
                    type:"request"
                }
                dapWebSocket.send(JSON.stringify(configDoneMessage))
            } else if (message.command === 'configurationDone' || message.command === 'next' || message.command === 'stepIn' || message.command === 'stepOut' || message.command === 'continue') {
                const threadsMessage:any = {
                    seq: seq++,
                    command:"threads",
                    type:"request",
                }
                dapWebSocket.send(JSON.stringify(threadsMessage))
            } else if (message.command === 'threads') {
                if (message.body.threads.length === 0) return
                $threads!.innerHTML = ''
                message.body.threads.forEach((thread:any) => {
                    $threads!.innerHTML += `[${thread.id}] ${thread.name}</br>`
                });
                defaultThreadId = message.body.threads[0].id
                const stackTraceMessage:any = {
                    seq: seq++,
                    command:"stackTrace",
                    type:"request",
                    arguments: {threadId: defaultThreadId,startFrame:0,levels:1}
                }
                dapWebSocket.send(JSON.stringify(stackTraceMessage))
            } else if (message.command === 'stackTrace') {
                if (isDebugging) {
                    if (!message.success) {
                        const stackTraceMessage:any = {
                            seq: seq++,
                            command:"stackTrace",
                            type:"request",
                            arguments: {threadId: defaultThreadId,startFrame:0,levels:1}
                        }
                        dapWebSocket.send(JSON.stringify(stackTraceMessage))
                        return
                    }
                    defaultFrameId = message.body.stackFrames[0].id
                    $callstack!.innerHTML = `Node(${excutedThreadsPid})</br>`
                    message.body.stackFrames.forEach((stackFrame:any) => {
                        $callstack!.innerHTML += `  [${stackFrame.name}]  <small>${stackFrame.source.name} ${stackFrame.column}:${stackFrame.line}</small> </br>`
                    });
                }
            } else if (message.command === 'terminate') {
                const disconnectMessage:any = {
                    seq: seq++,
                    command:"disconnect",
                    type:"request",
                    arguments: {restart: false}
                }
                dapWebSocket.send(JSON.stringify(disconnectMessage))
            }
        }
    })
});


// listen when the web socket is opened
listen({
    webSocket: lspWebSocket,
    onConnection: connection => {
        // create and start the language client
        const languageClient = createLanguageClient(connection);
        const disposable = languageClient.start();
        connection.onClose(() => disposable.dispose());
    }
});

function createLanguageClient(connection: MessageConnection): MonacoLanguageClient {
    return new MonacoLanguageClient({
        name: "Sample Language Client",
        clientOptions: {
            // use a language id as a document selector
            documentSelector: ['json'],
            // disable the default error handler
            errorHandler: {
                error: () => ErrorAction.Continue,
                closed: () => CloseAction.DoNotRestart
            }
        },
        // create a language client connection from the JSON RPC connection on demand
        connectionProvider: {
            get: (errorHandler, closeHandler) => {
                return Promise.resolve(createConnection(connection, errorHandler, closeHandler))
            }
        }
    });
}

function createUrl(path: string): string {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return normalizeUrl(`${protocol}://${location.host}${location.pathname}${path}`);
}

function createWebSocket(url: string): WebSocket {
    const socketOptions = {
        maxReconnectionDelay: 10000,
        minReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.3,
        connectionTimeout: 10000,
        maxRetries: Infinity,
        debug: false
    };
    return new ReconnectingWebSocket(url, undefined, socketOptions);
}
