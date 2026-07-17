import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.8,
};

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 17 17 7M8 7h9v9" {...stroke} />
    </IconBase>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 12 6-6 6 6M12 6v12" {...stroke} />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 12 4.2 4.2L19 6.5" {...stroke} />
    </IconBase>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m7 9.5 5 5 5-5" {...stroke} />
    </IconBase>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9.5 7 5 5-5 5" {...stroke} />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m7 7 10 10M17 7 7 17" {...stroke} />
    </IconBase>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 8h14M5 16h14" {...stroke} />
    </IconBase>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14M5 12h14" {...stroke} />
    </IconBase>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5.5 18.5 4 20l.5-4A7.8 7.8 0 0 1 3 11.5C3 7.4 6.8 4 11.5 4S20 7.4 20 11.5 16.2 19 11.5 19a9.5 9.5 0 0 1-6-.5Z" {...stroke} />
      <path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </IconBase>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 19V9M12 19V5M19 19v-7M3 19.5h18" {...stroke} />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" {...stroke} />
      <path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.6l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7l-.7-2h-3l-.7 2a7 7 0 0 0-1.6.7l-1.9-.9-2.1 2.1.9 1.9a7 7 0 0 0-.7 1.6l-2 .7v3l2 .7a7 7 0 0 0 .7 1.6l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.6.7l.7 2h3l.7-2a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.6l2-.7Z" {...stroke} />
    </IconBase>
  );
}

export function CreditIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="14" rx="2" width="20" x="2" y="5" {...stroke} />
      <path d="M2 10h20M6 15h3" {...stroke} />
    </IconBase>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10.5" cy="10.5" r="6" {...stroke} />
      <path d="m15 15 4.5 4.5" {...stroke} />
    </IconBase>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M3.5 12h17M12 3c2.3 2.4 3.5 5.4 3.5 9S14.3 18.6 12 21M12 3C9.7 5.4 8.5 8.4 8.5 12s1.2 6.6 3.5 9" {...stroke} />
    </IconBase>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 2.8h8l4 4V21H6V2.8Z" {...stroke} />
      <path d="M14 3v4h4M9 12h6M9 16h5" {...stroke} />
    </IconBase>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" {...stroke} />
    </IconBase>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5" {...stroke} />
    </IconBase>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9.5 14.5 5-5M7.5 16.5l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16.5 7.5l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" {...stroke} />
    </IconBase>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="13" rx="2" width="13" x="8" y="8" {...stroke} />
      <path d="M16 8V3H3v13h5" {...stroke} />
    </IconBase>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z" {...stroke} />
      <circle cx="12" cy="12" r="2.5" {...stroke} />
    </IconBase>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m4 4 16 16M10.7 7.1A10.5 10.5 0 0 1 12 7c6.3 0 9.5 5 9.5 5a13 13 0 0 1-2.2 2.7M6.1 6.8C3.7 8.4 2.5 12 2.5 12s3.2 5 9.5 5a10 10 0 0 0 3.2-.5M9.8 9.8a3 3 0 0 0 4.4 4.4" {...stroke} />
    </IconBase>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="8" cy="15" r="4" {...stroke} />
      <path d="m11 12 8-8M16 7l2 2M14 9l2 2" {...stroke} />
    </IconBase>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 2.5 20 6v5.4c0 4.6-3.2 8.3-8 10.1-4.8-1.8-8-5.5-8-10.1V6l8-3.5Z" {...stroke} />
      <path d="m8.5 12 2.2 2.2 4.8-5" {...stroke} />
    </IconBase>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="5" cy="12" fill="currentColor" r="1" />
      <circle cx="12" cy="12" fill="currentColor" r="1" />
      <circle cx="19" cy="12" fill="currentColor" r="1" />
    </IconBase>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect fill="currentColor" height="9" rx="1.5" width="9" x="7.5" y="7.5" />
      <circle cx="12" cy="12" r="9" {...stroke} />
    </IconBase>
  );
}

export function GoogleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21.4 12.2c0-.7-.1-1.4-.2-2H12v3.7h5.3a4.6 4.6 0 0 1-2 2.9v2.4h3.2c1.9-1.8 2.9-4.2 2.9-7Z" fill="currentColor" />
      <path d="M12 21.7c2.7 0 5-.9 6.6-2.4l-3.2-2.4c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3.1v2.5a10 10 0 0 0 8.9 5.5Z" fill="currentColor" opacity=".82" />
      <path d="M6.4 13.7A6 6 0 0 1 6.1 12c0-.6.1-1.2.3-1.7V7.8H3.1A10 10 0 0 0 2 12c0 1.5.4 2.9 1.1 4.2l3.3-2.5Z" fill="currentColor" opacity=".62" />
      <path d="M12 6.1c1.6 0 3 .6 4.1 1.6L19 4.9A9.7 9.7 0 0 0 12 2.3a10 10 0 0 0-8.9 5.5l3.3 2.5C7.2 7.9 9.4 6.1 12 6.1Z" fill="currentColor" opacity=".72" />
    </IconBase>
  );
}

export function GithubIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 2.8a9.4 9.4 0 0 0-3 18.3c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 2.9.9.1-.7.4-1.1.7-1.3-2.3-.3-4.7-1.1-4.7-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.8-4.7 5 .4.3.7 1 .7 1.9v2.9c0 .3.2.6.7.5A9.4 9.4 0 0 0 12 2.8Z"
        fill="currentColor"
      />
    </IconBase>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 2.5c.8 5.5 3.2 7.9 8.5 8.7-5.3.8-7.7 3.3-8.5 8.8-.8-5.5-3.2-8-8.5-8.8C8.8 10.4 11.2 8 12 2.5Z" {...stroke} />
    </IconBase>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M12 7v5l3.5 2" {...stroke} />
    </IconBase>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" {...stroke} />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" {...stroke} />
    </IconBase>
  );
}
