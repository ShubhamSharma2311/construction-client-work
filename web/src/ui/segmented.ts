// The look of shadcn's TabsList and TabsTrigger, for button rows that keep aria-pressed
// (a set of views or date presets is a choice of what to show, not a set of tab panels).
export const SEGMENTS =
  "inline-flex h-9 w-fit max-w-full shrink-0 self-start items-center gap-1 overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground [scrollbar-width:none]";

export const SEGMENT =
  "inline-flex h-full shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm";

// Wraps a row of segments: takes the width it is given and adds none of its own, so a long
// row scrolls inside the screen instead of widening the page around it.
export const SEGMENTS_FRAME = "w-full [contain:inline-size]";
