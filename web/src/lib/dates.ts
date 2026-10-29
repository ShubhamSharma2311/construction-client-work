const dayLabel = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Wed, 28 Oct": the business day in India, whatever the device's own time zone. */
export function formatDayLabel(at: Date): string {
  return dayLabel.format(at);
}
