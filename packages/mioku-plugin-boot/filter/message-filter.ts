import type { MessageFilterConfig, MessageFilterRule } from "../configs/base";

export function isMessageEventName(eventName: unknown): boolean {
  return (
    String(eventName || "") === "message" ||
    String(eventName || "").startsWith("message.")
  );
}

export function isAccessControlledEventName(eventName: unknown): boolean {
  const s = String(eventName || "");
  return (
    s === "message" ||
    s.startsWith("message.") ||
    s.startsWith("request.") ||
    s.startsWith("notice.")
  );
}

function resolveActorId(event: any, eventName: string): number | null {
  const s = String(eventName || "");
  if (s.startsWith("notice.")) {
    if (event?.operator_id != null) return Number(event.operator_id) || null;
    if (event?.user_id != null) return Number(event.user_id) || null;
    if (event?.sender?.user_id != null) return Number(event.sender.user_id) || null;
    return null;
  }
  if (event?.user_id != null) return Number(event.user_id) || null;
  if (event?.sender?.user_id != null) return Number(event.sender.user_id) || null;
  if (event?.operator_id != null) return Number(event.operator_id) || null;
  return null;
}

function resolveGroupId(event: any): number | null {
  if (event?.group_id != null) return Number(event.group_id) || null;
  return null;
}

function passesRule(id: number, rule: MessageFilterRule): boolean {
  if (rule.blacklist.length > 0 && rule.blacklist.includes(id)) return false;
  if (rule.whitelist.length > 0 && !rule.whitelist.includes(id)) return false;
  return true;
}

export function passesMessageFilter(
  event: any,
  eventName: string,
  filter: MessageFilterConfig,
): boolean {
  const groupId = resolveGroupId(event);
  if (groupId != null) {
    if (!passesRule(groupId, filter.group)) return false;
  }
  const actorId = resolveActorId(event, eventName);
  if (actorId != null) {
    if (!passesRule(actorId, filter.user)) return false;
  }
  return true;
}
