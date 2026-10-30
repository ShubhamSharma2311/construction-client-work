import type { ReactNode } from "react";
import { Badge } from "../components/ui/badge.tsx";

/** owed: red, money still due. received: settled. partial: some came in. quiet: a plain note. */
export type TagTone = "owed" | "received" | "partial" | "quiet";

const TONES: Record<TagTone, string> = {
  owed: "border-red-200 bg-red-50 text-red-700",
  received: "border-green-200 bg-green-50 text-green-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  quiet: "text-muted-foreground",
};

export function Tag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  return (
    <Badge variant="outline" className={TONES[tone]}>
      {children}
    </Badge>
  );
}
