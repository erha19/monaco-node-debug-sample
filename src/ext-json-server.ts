import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc';
import { start } from "./json-server";

const reader = new StreamMessageReader(process.stdin);
const writer = new StreamMessageWriter(process.stdout);
start(reader, writer);
