import type { OperatorPermission, VenueRole } from "@/lib/operator-types";

const permissionMatrix: Record<VenueRole, OperatorPermission[]> = {
  VENUE_OWNER: [
    "inbox:read",
    "inbox:write",
    "reservations:read",
    "reservations:write",
    "inventory:read",
    "inventory:write",
    "settings:read",
    "settings:write",
    "alerts:read",
    "activity:read",
    "team:manage",
    "ai:control",
  ],
  VENUE_MANAGER: [
    "inbox:read",
    "inbox:write",
    "reservations:read",
    "reservations:write",
    "inventory:read",
    "inventory:write",
    "alerts:read",
    "activity:read",
    "ai:control",
  ],
  VENUE_AGENT: [
    "inbox:read",
    "inbox:write",
    "reservations:read",
    "reservations:write",
    "inventory:read",
    "alerts:read",
    "activity:read",
  ],
};

export function listOperatorPermissions(role: VenueRole) {
  return permissionMatrix[role];
}

export function hasOperatorPermission(role: VenueRole, permission: OperatorPermission) {
  return permissionMatrix[role].includes(permission);
}
