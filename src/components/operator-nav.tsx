"use client";

import {
  Calendar,
  ChevronDown,
  Home,
  Inbox,
  LogOut,
  Martini,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/operator", label: "Overview", icon: Home },
  { href: "/operator/inbox", label: "Inbox", icon: Inbox },
  { href: "/operator/reservations", label: "Reservations", icon: Calendar },
  { href: "/operator/events", label: "Events", icon: Sparkles },
  { href: "/operator/settings", label: "Settings", icon: Settings, ownerOnly: true },
];

function formatRole(role: string) {
  return role.replace("VENUE_", "Venue ").replace("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function OperatorNav({
  user,
}: {
  user: {
    fullName: string;
    role: string;
    venue: { name: string };
  };
}) {
  const pathname = usePathname();

  return (
    <aside className="operator-sidebar">
      <div className="operator-sidebar-main">
        <Link href="/operator" className="operator-venue-switcher">
          <span className="operator-venue-mark">
            <Martini size={22} strokeWidth={1.8} />
          </span>
          <span className="operator-venue-copy">
            <strong>{user.venue.name}</strong>
            <small>Venue workspace</small>
          </span>
          <ChevronDown className="operator-sidebar-chevron" size={16} aria-hidden="true" />
        </Link>

        <nav className="operator-sidebar-nav" aria-label="Operator primary">
          {navigation
            .filter((item) => !item.ownerOnly || user.role === "VENUE_OWNER")
            .map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/operator"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`operator-sidebar-link ${isActive ? "active" : ""}`}
              >
                <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="operator-sidebar-footer">
        {user.role === "VENUE_OWNER" ? (
          <div className="operator-upgrade-card">
            <span>PRO</span>
            <strong>Grow your business</strong>
            <p>Unlock advanced analytics and marketing tools.</p>
            <Link href="/operator/settings" className="operator-upgrade-button">
              Upgrade Plan
            </Link>
          </div>
        ) : null}

        <div className="operator-profile">
          <span className="operator-profile-avatar">{user.fullName.slice(0, 1).toUpperCase()}</span>
          <span className="operator-profile-copy">
            <strong>{user.fullName}</strong>
            <small>{formatRole(user.role)}</small>
          </span>
          <form action="/operator/logout" method="post">
            <button type="submit" className="operator-logout-button" aria-label="Log out">
              <LogOut size={16} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
