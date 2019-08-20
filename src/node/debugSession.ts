import { DebugAdapter } from './debugAdapter'

let uuid = 1

export class DebugSession {
  id: number
  debugAdapter: any
  constructor (public socket: any) {
    this.id = uuid++
    this.start()
  }

  start (){
    if (!this.debugAdapter) {
      this.debugAdapter = new DebugAdapter(this.socket)
    }
    this.socket.onMessage(async (event: any) => {
      try {
        event = JSON.parse(event)
      } catch(e) {
        console.error(e)
      }
      if (event.type === 'event' || event.type === 'request' || event.type === 'response') {
        await this.handleMessage(event)
      }
    })
  }

  async handleMessage(event: DebugProtocol.ProtocolMessage) {
    if (event.type === 'request') {
      await this.handleRequest(event as DebugProtocol.Request);
    } else if (event.type === 'response') {
      this.handleResponse(event as DebugProtocol.Response);
    } else if (event.type === 'event') {
      await this.handleEvent(event as DebugProtocol.Event);
    }
  }

  async handleRequest(event: DebugProtocol.Request) {
    if (event.command === 'initialize') {
      await this.debugAdapter.startSession()
    }
    this.debugAdapter.sendMessage(event)
    console.log('DebugProtocol.Request', event)
  }

  handleResponse(event: DebugProtocol.Response) {
    console.log('DebugProtocol.Response', event)
  }

  handleEvent(event: DebugProtocol.Event) {
    this.debugAdapter.sendMessage(event)
    console.log('DebugProtocol.Response', event)
  }

}