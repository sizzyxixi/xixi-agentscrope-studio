import type { SVGProps } from "react";

// Based on Hugeicons Delete01 (Stroke Rounded), MIT. The full state adds paper contents.
// Source: @hugeicons/core-free-icons 4.4.0, https://hugeicons.com/icon/delete-01
export function RecycleBinIcon({full=false,size=18,...props}:SVGProps<SVGSVGElement>&{full?:boolean;size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {full&&<><path d="M7 6V3.5L10 2L13 4V6M12 6L14 2.5L18 4L17.5 6"/><path d="M8 10L10.5 12L9 16L13 18L16 14L14 11Z" fill="currentColor" opacity={.2} stroke="none"/></>}
    <path d="M18.8516 16.3743L19.5 6H4.5L5.14839 16.3743C5.315 19.0401 5.39831 20.373 6.26426 21.1865C7.13021 22 8.46571 22 11.1367 22H12.8633C15.5343 22 16.8698 22 17.7357 21.1865C18.6017 20.373 18.685 19.0401 18.8516 16.3743Z"/>
    {!full&&<path d="M16 6H21M16 6L15.3778 4.34082C15.0007 3.33524 14.8122 2.83245 14.4402 2.50292C14.3213 2.39765 14.1904 2.3069 14.0501 2.2326C13.6109 2 13.074 2 12 2C10.926 2 10.3891 2 9.9499 2.2326C9.8096 2.3069 9.67865 2.39765 9.55982 2.50292C9.18783 2.83245 8.99928 3.33524 8.62219 4.34082L8 6M16 6H8M3 6H8"/>}
  </svg>;
}
