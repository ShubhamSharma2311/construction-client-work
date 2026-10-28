-- One definition of a customer's standing, read by both the per-customer balance and the
-- dues list, so the two can never disagree. Only live (not deleted) rows count.
CREATE VIEW "CustomerTotals" AS
SELECT c.id AS "customerId",
       COALESCE(t.billed, 0)::bigint AS billed,
       COALESCE(p.paid, 0)::bigint AS paid,
       (COALESCE(t.billed, 0) - COALESCE(p.paid, 0))::bigint AS balance,
       COALESCE(t.due, 0)::bigint AS due,
       COALESCE(p.credit, 0)::bigint AS credit,
       t."oldestDueDate"
FROM "Customer" c
LEFT JOIN (
  SELECT "customerId",
         SUM("amountPaise") AS billed,
         SUM("amountPaise" - "receivedPaise") AS due,
         MIN("tripDate") FILTER (WHERE "receivedPaise" < "amountPaise") AS "oldestDueDate"
  FROM "Trip" WHERE "deletedAt" IS NULL GROUP BY "customerId"
) t ON t."customerId" = c.id
LEFT JOIN (
  SELECT "customerId",
         SUM("amountPaise") AS paid,
         COALESCE(SUM("amountPaise" - "allocatedPaise") FILTER (WHERE "kind" = 'PAYMENT'), 0) AS credit
  FROM "CustomerPayment" WHERE "deletedAt" IS NULL GROUP BY "customerId"
) p ON p."customerId" = c.id;
