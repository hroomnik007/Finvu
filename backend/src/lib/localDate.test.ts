import { expect, it } from "vitest";
import { localDateISO } from "./localDate";

it("gives the calendar day in the time zone, not in UTC", () => {
  // 23:30 UTC on 31 Oct is already 1 Nov in Bratislava (winter time, UTC+1)
  expect(localDateISO(new Date("2026-10-31T23:30:00Z"), "Europe/Bratislava")).toBe("2026-11-01");
  expect(localDateISO(new Date("2026-10-31T23:30:00Z"), "UTC")).toBe("2026-10-31");
  // summer time (UTC+2)
  expect(localDateISO(new Date("2026-07-14T22:30:00Z"), "Europe/Bratislava")).toBe("2026-07-15");
});
