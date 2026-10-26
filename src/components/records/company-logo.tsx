"use client";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Building2, Copy, ExternalLink, Check } from "lucide-react";
import { companySite } from "@/lib/domain/company-site";
import styles from "./relations.module.css";

export function CompanyLogo({
  name,
  domain,
  size = 28,
  interactive = true,
}: {
  name: string;
  domain: string | null | undefined;
  size?: number;
  interactive?: boolean;
}) {
  const site = companySite(domain);
  const [failed, setFailed] = useState(""),
    [open, setOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function enter() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  }
  function leave() {
    timer.current = setTimeout(() => setOpen(false), 180);
  }
  const image = (
    <span className={styles.logo} style={{ width: size, height: size }}>
      {site && failed !== site.icon ? (
        // The browser loads only the public site's icon; no server fetch or image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={site.icon}
          alt={"Logo de " + name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(site.icon)}
        />
      ) : (
        <Building2 size={Math.max(14, size * 0.6)} aria-hidden="true" />
      )}
    </span>
  );
  if (!site || !interactive) return image;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={styles.logoButton}
          type="button"
          aria-label={"Site de " + name}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onFocus={enter}
          onClick={(event) => event.stopPropagation()}
        >
          {image}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.siteCard}
          sideOffset={6}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onClick={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <strong>{name}</strong>
          <a href={site.href} target="_blank" rel="noopener noreferrer">
            {site.host}
            <ExternalLink size={13} />
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(site.href);
                setCopied(true);
                setError("");
              } catch {
                setError("La copie du lien a échoué.");
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
          {error && <small role="alert">{error}</small>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
