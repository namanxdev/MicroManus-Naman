"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getJson, postJson } from "../lib/client/api";
import { Brand } from "./ui/brand";
import {
  ChartIcon,
  ChatIcon,
  CloseIcon,
  CreditIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
} from "./ui/icons";

interface AppShellProps {
  children: ReactNode;
  sidebarExtra?: ReactNode;
  credits?: number;
  contentClassName?: string;
}

const navigation = [
  { href: "/chat", label: "Research", icon: ChatIcon },
  { href: "/usage", label: "Usage", icon: ChartIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell({
  children,
  sidebarExtra,
  credits,
  contentClassName = "",
}: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [account, setAccount] = useState<{ name?: string; email?: string; credits: number }>({
    credits: credits ?? 0,
  });

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    let mounted = true;
    getJson<{
      authenticated: boolean;
      user?: { name?: string | null; email?: string | null } | null;
      billing?: { credits?: number };
    }>("/api/auth/session")
      .then((session) => {
        if (!mounted || !session.authenticated) return;
        setAccount({
          name: session.user?.name || undefined,
          email: session.user?.email || undefined,
          credits: Number(session.billing?.credits || 0),
        });
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const availableCredits = credits ?? account.credits;
  const accountLabel = account.name || account.email || "Research workspace";
  const initials = accountLabel
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "MM";

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await postJson<{ ok: boolean }>("/api/auth/signout", {});
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="mobile-bar">
        <Brand href="/chat" />
        <button
          aria-expanded={open}
          aria-label="Open navigation"
          className="icon-button"
          onClick={() => setOpen(true)}
          type="button"
        >
          <MenuIcon />
        </button>
      </header>

      {open && (
        <button
          aria-label="Close navigation"
          className="sidebar-scrim"
          onClick={() => setOpen(false)}
          type="button"
        />
      )}

      <aside className={`app-sidebar ${open ? "app-sidebar--open" : ""}`}>
        <div className="app-sidebar__head">
          <Brand href="/chat" />
          <button
            aria-label="Close navigation"
            className="icon-button app-sidebar__close"
            onClick={() => setOpen(false)}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <Link className="new-research-button" href="/chat">
          <PlusIcon size={17} />
          New research
          <span aria-hidden="true" className="shortcut-key">
            N
          </span>
        </Link>

        <nav aria-label="Primary" className="app-nav">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href === "/chat" && pathname.startsWith("/chat/"));
            return (
              <Link className={active ? "is-active" : ""} href={href} key={href}>
                <Icon size={18} />
                <span>{label}</span>
                {label === "Research" && <span className="nav-status-dot" />}
              </Link>
            );
          })}
        </nav>

        {sidebarExtra && <div className="app-sidebar__extra">{sidebarExtra}</div>}

        <div className="app-sidebar__footer">
          <Link className="credit-meter" href="/usage">
            <span className="credit-meter__icon">
              <CreditIcon size={17} />
            </span>
            <span>
              <small>Available credit</small>
              <strong>${availableCredits.toFixed(2)}</strong>
            </span>
            <span className="credit-meter__line">
              <span style={{ width: `${Math.min(100, Math.max(3, (availableCredits / 5) * 100))}%` }} />
            </span>
          </Link>
          <button
            aria-label="Sign out of MicroManus"
            className="account-row"
            disabled={signingOut}
            onClick={signOut}
            title="Sign out"
            type="button"
          >
            <span className="account-avatar">{initials}</span>
            <span className="account-copy">
              <strong>{accountLabel}</strong>
              <small>{account.email && account.name ? account.email : "Personal account"}</small>
            </span>
            <span className="account-menu-dots">
              {signingOut ? "Leaving…" : "Sign out"}
            </span>
          </button>
        </div>
      </aside>

      <main className={`app-content ${contentClassName}`} id="main-content">
        {children}
      </main>
    </div>
  );
}
