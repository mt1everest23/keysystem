import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const licensesTable = pgTable(
  "licenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    keyHash: text("key_hash").notNull().unique(),
    keyPreview: text("key_preview").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    deviceHash: text("device_hash"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    totalValidations: integer("total_validations").notNull().default(0),
  },
  (table) => [index("licenses_created_at_idx").on(table.createdAt)],
);

export const licenseEventsTable = pgTable(
  "license_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    licenseId: uuid("license_id").references(() => licensesTable.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    outcome: text("outcome").notNull(),
    keyPreview: text("key_preview"),
    clientVersion: text("client_version"),
    environment: text("environment"),
    actorId: text("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("license_events_created_at_idx").on(table.createdAt),
    index("license_events_type_created_at_idx").on(table.eventType, table.createdAt),
    index("license_events_license_id_idx").on(table.licenseId),
  ],
);

export type LicenseRecord = typeof licensesTable.$inferSelect;
export type LicenseEvent = typeof licenseEventsTable.$inferSelect;
