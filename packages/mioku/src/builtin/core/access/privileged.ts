import { botConfig } from "../../../config";

export function isPrivilegedUser(userId: string | number | undefined): boolean {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) return false;
  const owners = Array.isArray(botConfig?.owners) ? botConfig.owners : [];
  const admins = Array.isArray(botConfig?.admins) ? botConfig.admins : [];
  return [...owners, ...admins].some(
    (value) => String(value).trim() === normalizedUserId,
  );
}
