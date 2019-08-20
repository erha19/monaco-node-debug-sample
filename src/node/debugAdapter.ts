import * as cp from 'child_process';
import * as path from 'path'
import * as stream from 'stream';
import { AbstractDebugAdapter } from './abstractDebugAdapter'

export class DebugAdapter extends AbstractDebugAdapter{
  private static readonly TWO_CRLF = '\r\n\r\n';
	private static readonly HEADER_LINESEPARATOR = /\r?\n/;	// allow for non-RFC 2822 conforming line separators
  private static readonly HEADER_FIELDSEPARATOR = /: */;
  
  serverProcess: cp.ChildProcess
  outputStream: any
  rawData: any
  contentLength: any
  wssocket: any

  protected connect(readable: stream.Readable, writable: stream.Writable): void {

		this.outputStream = writable;
		this.rawData = Buffer.allocUnsafe(0);
		this.contentLength = -1;

		readable.on('data', (data: Buffer) => this.handleData(data));
  }

  constructor(socket: any) {
    super();
    this.wssocket = socket
  }

  sendMessage(message: DebugProtocol.ProtocolMessage): void {

		if (this.outputStream) {
			const json = JSON.stringify(message);
			this.outputStream.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}${DebugAdapter.TWO_CRLF}${json}`, 'utf8');
		}
	}
  
  stopSession(): Promise<void> {

		// Cancel all sent promises on disconnect so debug trees are not left in a broken state #3666.
		this.cancelPending();
    if (this.wssocket) {
      this.wssocket.close()
    }

		return Promise.resolve(undefined);
  }
  
  private handleData(data: Buffer): void {

		this.rawData = Buffer.concat([this.rawData, data]);

		while (true) {
			if (this.contentLength >= 0) {
				if (this.rawData.length >= this.contentLength) {
					const message = this.rawData.toString('utf8', 0, this.contentLength);
					this.rawData = this.rawData.slice(this.contentLength);
					this.contentLength = -1;
					if (message.length > 0) {
						try {
              let temp = JSON.parse(message)
              if (temp.command === 'initialize') {
                temp.body.cwd = path.join(__dirname, '../../')
              }
							this.wssocket!.send(JSON.stringify(temp));
						} catch (e) {
							console.error(new Error((e.message || e) + '\n' + message));
						}
					}
					continue;	// there may be more complete messages to process
				}
			} else {
				const idx = this.rawData.indexOf(DebugAdapter.TWO_CRLF);
				if (idx !== -1) {
					const header = this.rawData.toString('utf8', 0, idx);
					const lines = header.split(DebugAdapter.HEADER_LINESEPARATOR);
					for (const h of lines) {
						const kvPair = h.split(DebugAdapter.HEADER_FIELDSEPARATOR);
						if (kvPair[0] === 'Content-Length') {
							this.contentLength = Number(kvPair[1]);
						}
					}
					this.rawData = this.rawData.slice(idx + DebugAdapter.TWO_CRLF.length);
					continue;
				}
			}
			break;
		}
  }
  
  async startSession(): Promise<void> {
    const nodeDebug2 = path.join(__dirname, `../../downloads/vscode-node-debug2/out/src/nodeDebug.js`);
    const forkOptions: cp.ForkOptions = {
      env: process.env,
      execArgv: [],
      silent: true
    };
    const child = cp.fork(nodeDebug2, [], forkOptions);
    if (!child.pid) {
      throw new Error(`Unable to launch debug adapter from ${nodeDebug2}`);
    }
    this.serverProcess = child;

    this.serverProcess.on('error', err => {
      console.error(err);
    });
    this.serverProcess.on('exit', (code, signal) => {
      console.log(code);
    });

    this.serverProcess.stdout.on('close', (error:any) => {
      console.error(error);
    });
    this.serverProcess.stdout.on('error', error => {
      console.error(error);
    });

    this.serverProcess.stdin.on('error', error => {
      console.error(error);
    });

    this.connect(this.serverProcess.stdout, this.serverProcess.stdin);

  }
}