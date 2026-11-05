import type { Media } from "./commerce-demo-data";

export function historyFileType(media: Media): "图片" | "视频" | "文档" | "其他" {
  if (media.type === "image") return "图片";
  if (media.type === "video") return "视频";
  const filename = media.name.includes(".") ? media.name : media.url.split(/[?#]/)[0];
  return /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|rtf|odt|ods|odp)$/i.test(filename) ? "文档" : "其他";
}

export function matchesHistoryType(media: Media, type: string) {
  return type === "全部" || historyFileType(media) === type;
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
export function groupHistoryByDay(items: Media[], ascending = false, now = Date.now()) {
  const today = dayFormatter.format(new Date(now));
  const yesterday = dayFormatter.format(new Date(now - 86400000));
  const groups = new Map<string, Media[]>();
  for (const item of items) {
    const day = dayFormatter.format(new Date(item.createdAt));
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups].sort(([a], [b]) => ascending ? a.localeCompare(b) : b.localeCompare(a)).map(([day, media]) => {
    const [year, month, date] = day.split("-");
    const label = day === today ? "今天" : day === yesterday ? "昨天" : `${year === today.slice(0, 4) ? "" : `${year} 年 `}${Number(month)} 月 ${Number(date)} 日`;
    return { day, label, media };
  });
}
