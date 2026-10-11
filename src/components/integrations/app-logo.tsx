"use client";
import Image from "next/image";
import { useState } from "react";
import styles from "./apps.module.css";

// Original vendor assets. Keep their colors, proportions and backgrounds intact.
// unoptimized leaves the provider's SVG/PNG unchanged and avoids server-side CDN fetching.
const assets: Record<string, { src: string; fallback: string }> = {
  "api-webhooks": { src: "/icon.svg", fallback: "Z" },
  "google-drive": {
    src: "https://www.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png",
    fallback: "GD",
  },
  "google-sheets": {
    src: "https://www.gstatic.com/images/branding/product/2x/sheets_2020q4_48dp.png",
    fallback: "GS",
  },
  onedrive: {
    src: "https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product/svg/onedrive_48x1.svg",
    fallback: "OD",
  },
  slack: { src: "https://slack.com/favicon.ico", fallback: "Sl" },
  stripe: { src: "https://stripe.com/favicon.ico", fallback: "St" },
  calendly: { src: "https://calendly.com/favicon.ico", fallback: "Ca" },
  typeform: { src: "https://www.typeform.com/favicon.ico", fallback: "Ty" },
  notion: { src: "https://www.notion.com/favicon.ico", fallback: "N" },
  dropbox: { src: "https://www.dropbox.com/favicon.ico", fallback: "D" },
  pandadoc: { src: "https://www.pandadoc.com/favicon.ico", fallback: "P" },
  apollo: { src: "https://www.apollo.io/favicon.ico", fallback: "A" },
  gmail: {
    src: "https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png",
    fallback: "G",
  },
  "google-calendar": {
    src: "https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_48dp.png",
    fallback: "GC",
  },
  "google-meet": {
    src: "https://www.gstatic.com/images/branding/product/2x/meet_2020q4_48dp.png",
    fallback: "GM",
  },
  outlook: {
    src: "https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product/svg/outlook_48x1.svg",
    fallback: "O",
  },
  "outlook-calendar": {
    src: "https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product/svg/outlook_48x1.svg",
    fallback: "OC",
  },
  "microsoft-teams": {
    src: "https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product/svg/teams_48x1.svg",
    fallback: "T",
  },
  zoom: {
    src: "https://media.zoom.com/images/assets/zoom-logo-2025.png/Zz04ZjU1ODA4OGM5NjUxMWYwYWQ3NDIyZTYxNWM4NmY4Yg%3D%3D",
    fallback: "Z",
  },
  zapier: {
    src: "https://images.ctfassets.net/27w7hkots21d/1UT0KHF5gGjqt7jD3rLNgs/2ab32f0f1cedfa76c87c5330ac7c3e69/zapier-preview-orange.png",
    fallback: "Za",
  },
};

export function AppLogo({ id, large = false }: { id: string; large?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const asset = assets[id];
  return (
    <span className={`${styles.logo} ${large ? styles.logoLarge : ""}`} aria-hidden="true">
      {asset && failedSource !== asset.src ? (
        <Image
          src={asset.src}
          alt=""
          width={large ? 54 : 32}
          height={large ? 54 : 32}
          unoptimized
          onError={() => setFailedSource(asset.src)}
        />
      ) : (
        <span className={styles.logoFallback}>
          {asset?.fallback ?? id.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
