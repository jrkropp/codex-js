import type { EventMsg } from "../../core/src/protocol";
import {
	eventMsgToAppServerEvents,
	serverRequestResolvedNotification,
	type AppServerProtocolEvent,
	type EventMappingContext,
	type ServerRequestCoreTarget,
} from "../../app-server-protocol/src/protocol/event-mapping";

export type {
	AppServerProtocolEvent,
	EventMappingContext,
	ServerRequestCoreTarget,
};

export function mapCoreEventToAppServerEvents(
	msg: EventMsg,
	context: EventMappingContext,
): AppServerProtocolEvent[] {
	return eventMsgToAppServerEvents(msg, context);
}

export { serverRequestResolvedNotification };
