import { AlarmClock as LucideAlarmClock } from "lucide-react";
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

function Icon({
  children,
  size = 16,
  strokeWidth = 2,
  ...props
}: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DiamondPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2 22 12 12 22 2 12 12 2Z" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </Icon>
  );
}

export function Workflow(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="6" rx="1.5" width="6" x="3" y="3" />
      <rect height="6" rx="1.5" width="6" x="15" y="15" />
      <path d="M9 6h3a4 4 0 0 1 4 4v5" />
      <path d="m13 12 3 3 3-3" />
    </Icon>
  );
}

export function Blocks(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="7" rx="1.5" width="7" x="3" y="3" />
      <rect height="7" rx="1.5" width="7" x="14" y="3" />
      <rect height="7" rx="1.5" width="7" x="8.5" y="14" />
    </Icon>
  );
}

export function AlarmClock(props: IconProps) {
  return <LucideAlarmClock size={16} aria-hidden="true" {...props} />;
}

export function Database(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </Icon>
  );
}

export function MemoryStick(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 19V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" />
      <path d="M8 21h8" />
      <path d="M10 7h4" />
      <path d="M10 11h4" />
      <path d="M9 19v2" />
      <path d="M15 19v2" />
    </Icon>
  );
}

export function SquareUser(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 19c.8-2.3 2.6-3.5 5-3.5s4.2 1.2 5 3.5" />
    </Icon>
  );
}

export function CloudUpload(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 13v8" />
      <path d="m8 17 4-4 4 4" />
      <path d="M20 16.2A4.5 4.5 0 0 0 18 7.7 6 6 0 0 0 6.5 9.1 4 4 0 0 0 6 17h1" />
    </Icon>
  );
}

export function FolderOpen(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 17h12a2 2 0 0 0 1.9-1.4l1.6-5A2 2 0 0 0 19.6 8H8.4a2 2 0 0 0-1.9 1.4L4.9 14.4A2 2 0 0 1 3 16V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2" />
    </Icon>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function SquarePlus(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </Icon>
  );
}

export function Box(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </Icon>
  );
}

export function Sparkles(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 9.7 8.7 4 11l5.7 2.3L12 19l2.3-5.7L20 11l-5.7-2.3L12 3Z" />
      <path d="M5 3v4" />
      <path d="M3 5h4" />
      <path d="M19 17v4" />
      <path d="M17 19h4" />
    </Icon>
  );
}

export function SendHorizontal(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 3 18 9-18 9 4-9-4-9Z" />
      <path d="M7 12h14" />
    </Icon>
  );
}

export function Store(props: IconProps) {
  return <Icon {...props}><path d="M3 10V7l2-4h14l2 4v3" /><path d="M3 10a3 3 0 0 0 4 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 4-2M5 13v8h14v-8M9 21v-6h6v6M3 7h18" /></Icon>;
}
