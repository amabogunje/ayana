"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/venues", label: "Venues" },
  { href: "/leads", label: "Leads" },
  { href: "/alerts", label: "Alerts" },
  { href: "/reports", label: "Reports" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export function TopNav({
  user,
}: {
  user?: { fullName: string; role: "PLATFORM_OWNER" | "PLATFORM_ADMIN" } | null;
}) {
  const pathname = usePathname();

  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/system" ||
    pathname.startsWith("/operator") ||
    pathname.startsWith("/widget")
  ) {
    return null;
  }

  return (
    <header className="top-nav-shell">
      <div className="top-nav-inner">
        <Link href="/dashboard" className="brand-lockup">
          <span>
            <strong className="ayana-admin-wordmark">ayana</strong>
            <small>Platform Owner</small>
          </span>
        </Link>

        <div className="top-nav-right">
          <nav className="top-nav-links" aria-label="Primary">
            {navigation.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`top-nav-link ${isActive ? "active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}

            <form action="/logout" method="post">
              <button type="submit" className="top-nav-link top-nav-button">
                Log out
              </button>
            </form>
          </nav>

          {user ? (
            <div className="nav-user">
              <strong>{user.fullName}</strong>
              <small>{user.role === "PLATFORM_OWNER" ? "Platform Owner" : "Platform Admin"}</small>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
