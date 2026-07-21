import { eq, and } from "drizzle-orm"
import { db } from "../db/index.js"
import { dayCloses } from "../db/schema/index.js"
import { localDateStr } from "../lib/dateRange.js"

// Once a business date is closed, bills created on it are locked: no voids,
// refunds, discount edits, or new payments — those would silently change a
// day the owner has already reconciled and reported.
export async function isDayClosed(outletId: string, at: Date): Promise<boolean> {
  const row = await db.query.dayCloses.findFirst({
    where: and(eq(dayCloses.outletId, outletId), eq(dayCloses.businessDate, localDateStr(at))),
    columns: { id: true },
  })
  return !!row
}

export const DAY_CLOSED_ERROR = "This bill's business day has been closed — reopen is not supported"
