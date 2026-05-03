"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

type ScrollAnchorLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  targetId: string;
  children: ReactNode;
};

export function ScrollAnchorLink({ targetId, children, onClick, ...props }: ScrollAnchorLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    const target = document.getElementById(targetId);

    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${targetId}`);
  }

  return (
    <a href={`#${targetId}`} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
