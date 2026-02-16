import { AgentState } from './agent';
import { LogEntry } from './logs';
export type IPCMessageType = 'state_update' | 'log_entry' | 'command' | 'config_update' | 'ide_event';
export interface BaseIPCMessage {
    type: IPCMessageType;
    timestamp: string;
}
export interface StateUpdateMessage extends BaseIPCMessage {
    type: 'state_update';
    payload: AgentState;
}
export interface LogEntryMessage extends BaseIPCMessage {
    type: 'log_entry';
    payload: LogEntry;
}
export interface CommandMessage extends BaseIPCMessage {
    type: 'command';
    payload: {
        action: 'start' | 'stop' | 'restart' | 'clear_logs';
        args?: any;
    };
}
export interface IDEEventMessage extends BaseIPCMessage {
    type: 'ide_event';
    payload: {
        event: 'save' | 'terminal_start' | 'terminal_end';
        file?: string;
    };
}
export type IPCMessage = StateUpdateMessage | LogEntryMessage | CommandMessage | IDEEventMessage;
