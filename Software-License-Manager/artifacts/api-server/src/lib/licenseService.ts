import { createHash, randomBytes } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  licenseEventsTable,
  licensesTable,
  type LicenseRecord,
} from "@workspace/db";
import { logger } from "./logger";

type EventType =
  | "issued"
  | "activation"
  | "validation"
  | "checkpoint"
  | "security"
  | "revoked"
  | "device_reset";

export type VerifyInput = {
  key: string;
  installId: string;
  clientVersion?: string;
  environment?: string;
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeKey(key: string): string {
  return key.trim().toUpperCase();
}

function makeKeyPreview(key: string): string {
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

function publicLicense(license: LicenseRecord) {
  const revoked = license.revokedAt !== null;
  const expired = license.expiresAt.getTime() <= Date.now();
  return {
    id: license.id,
    keyPreview: license.keyPreview,
    note: license.note,
    status: revoked ? "revoked" : expired ? "expired" : "active",
    createdAt: license.createdAt,
    expiresAt: license.expiresAt,
    activatedAt: license.activatedAt,
    deviceBound: license.deviceHash !== null,
    totalValidations: license.totalValidations,
  } as const;
}

async function recordEvent(input: {
  licenseId?: string | null;
  eventType: EventType;
  outcome: string;
  keyPreview?: string | null;
  clientVersion?: string | null;
  environment?: string | null;
  actorId?: string | null;
}): Promise<void> {
  await db.insert(licenseEventsTable).values({
    licenseId: input.licenseId ?? null,
    eventType: input.eventType,
    outcome: input.outcome,
    keyPreview: input.keyPreview ?? null,
    clientVersion: input.clientVersion ?? null,
    environment: input.environment ?? null,
    actorId: input.actorId ?? null,
  });

  if (
    input.eventType === "activation" ||
    input.eventType === "validation" ||
    input.eventType === "security"
  ) {
    sendWebhookEvent(input.eventType, input.outcome, input.keyPreview ?? null);
  }
}

function sendWebhookEvent(
  eventType: "activation" | "validation" | "security",
  outcome: string,
  keyPreview: string | null,
): void {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const content = [
    eventType === "activation"
      ? "License activation"
      : eventType === "validation"
        ? "Successful license validation"
        : "License security alert",
    `Outcome: ${outcome}`,
    keyPreview ? `Key: ${keyPreview}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  void fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(5000),
  }).then((response) => {
    if (!response.ok) {
      logger.warn({ status: response.status }, "Discord webhook rejected an audit event");
    }
  }).catch((err: unknown) => {
    logger.warn({ err }, "Discord webhook delivery failed");
  });
}

export async function issueLicense(input: {
  hours: number;
  note?: string;
  actorId: string;
}) {
  const now = new Date();
  const key = `LIC-${randomBytes(24).toString("hex").toUpperCase()}`;
  const [license] = await db
    .insert(licensesTable)
    .values({
      keyHash: digest(key),
      keyPreview: makeKeyPreview(key),
      note: input.note?.trim() || null,
      createdBy: input.actorId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + input.hours * 60 * 60 * 1000),
    })
    .returning();

  await recordEvent({
    licenseId: license.id,
    eventType: "issued",
    outcome: "issued",
    keyPreview: license.keyPreview,
    actorId: input.actorId,
  });

  return {
    id: license.id,
    key,
    keyPreview: license.keyPreview,
    note: license.note,
    createdAt: license.createdAt,
    expiresAt: license.expiresAt,
  };
}

export async function listLicenses(input: {
  search?: string;
  status?: "active" | "expired" | "revoked";
  page: number;
  pageSize: number;
}) {
  const now = new Date();
  const filters = [];
  if (input.search) {
    const pattern = `%${input.search}%`;
    filters.push(or(ilike(licensesTable.keyPreview, pattern), ilike(licensesTable.note, pattern))!);
  }
  if (input.status === "revoked") {
    filters.push(isNotNull(licensesTable.revokedAt));
  } else if (input.status === "expired") {
    filters.push(and(isNull(licensesTable.revokedAt), lte(licensesTable.expiresAt, now))!);
  } else if (input.status === "active") {
    filters.push(and(isNull(licensesTable.revokedAt), gt(licensesTable.expiresAt, now))!);
  }

  const where = filters.length ? and(...filters) : undefined;
  const [{ total = 0 } = {}] = await db
    .select({ total: count() })
    .from(licensesTable)
    .where(where);
  const records = await db
    .select()
    .from(licensesTable)
    .where(where)
    .orderBy(desc(licensesTable.createdAt))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  return {
    items: records.map(publicLicense),
    total: Number(total),
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function revokeLicense(id: string, actorId: string) {
  const [license] = await db
    .update(licensesTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(licensesTable.id, id), isNull(licensesTable.revokedAt)))
    .returning();
  if (!license) {
    const [existing] = await db.select().from(licensesTable).where(eq(licensesTable.id, id)).limit(1);
    if (!existing) return null;
    return publicLicense(existing);
  }

  await recordEvent({
    licenseId: license.id,
    eventType: "revoked",
    outcome: "revoked",
    keyPreview: license.keyPreview,
    actorId,
  });
  return publicLicense(license);
}

export async function resetLicenseDevice(id: string, actorId: string) {
  const [license] = await db
    .update(licensesTable)
    .set({ deviceHash: null })
    .where(eq(licensesTable.id, id))
    .returning();
  if (!license) return null;

  await recordEvent({
    licenseId: license.id,
    eventType: "device_reset",
    outcome: "device_registration_cleared",
    keyPreview: license.keyPreview,
    actorId,
  });
  return publicLicense(license);
}

function verificationResult(
  success: boolean,
  code: "active" | "expired" | "device_mismatch" | "revoked" | "invalid",
  license?: LicenseRecord,
  activated = false,
) {
  const now = Date.now();
  const expiresAt = license?.expiresAt ?? null;
  return {
    success,
    code,
    activated,
    expiresAt,
    remainingSeconds: expiresAt
      ? Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000))
      : 0,
    totalValidations: license?.totalValidations ?? 0,
  };
}

export async function verifyLicense(input: VerifyInput) {
  const normalizedKey = normalizeKey(input.key);
  const installHash = digest(input.installId.trim());
  let [license] = await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.keyHash, digest(normalizedKey)))
    .limit(1);

  if (!license) {
    await recordEvent({
      eventType: "security",
      outcome: "invalid_key",
      clientVersion: input.clientVersion,
      environment: input.environment,
    });
    return verificationResult(false, "invalid");
  }

  if (license.revokedAt) {
    await recordEvent({
      licenseId: license.id,
      eventType: "security",
      outcome: "revoked_key_used",
      keyPreview: license.keyPreview,
      clientVersion: input.clientVersion,
      environment: input.environment,
    });
    return verificationResult(false, "revoked", license);
  }

  if (license.expiresAt.getTime() <= Date.now()) {
    await recordEvent({
      licenseId: license.id,
      eventType: "security",
      outcome: "expired_key_used",
      keyPreview: license.keyPreview,
      clientVersion: input.clientVersion,
      environment: input.environment,
    });
    return verificationResult(false, "expired", license);
  }

  let activated = license.activatedAt === null;
  if (!license.deviceHash) {
    const [bound] = await db
      .update(licensesTable)
      .set({
        deviceHash: installHash,
        activatedAt: license.activatedAt ?? new Date(),
      })
      .where(and(eq(licensesTable.id, license.id), isNull(licensesTable.deviceHash)))
      .returning();

    if (bound) {
      license = bound;
    } else {
      [license] = await db
        .select()
        .from(licensesTable)
        .where(eq(licensesTable.id, license.id))
        .limit(1);
      if (!license) return verificationResult(false, "invalid");
      activated = false;
    }
  }

  if (license.deviceHash !== installHash) {
    await recordEvent({
      licenseId: license.id,
      eventType: "security",
      outcome: "device_mismatch",
      keyPreview: license.keyPreview,
      clientVersion: input.clientVersion,
      environment: input.environment,
    });
    return verificationResult(false, "device_mismatch", license);
  }

  const [updated] = await db
    .update(licensesTable)
    .set({ totalValidations: sql`${licensesTable.totalValidations} + 1` })
    .where(
      and(
        eq(licensesTable.id, license.id),
        eq(licensesTable.deviceHash, installHash),
        isNull(licensesTable.revokedAt),
        gt(licensesTable.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!updated) {
    const [current] = await db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.id, license.id))
      .limit(1);
    if (!current) return verificationResult(false, "invalid");
    if (current.revokedAt) return verificationResult(false, "revoked", current);
    if (current.expiresAt.getTime() <= Date.now()) {
      return verificationResult(false, "expired", current);
    }
    return verificationResult(false, "device_mismatch", current);
  }

  await recordEvent({
    licenseId: updated.id,
    eventType: activated ? "activation" : "validation",
    outcome: "success",
    keyPreview: updated.keyPreview,
    clientVersion: input.clientVersion,
    environment: input.environment,
  });

  return verificationResult(true, "active", updated, activated);
}

export async function inspectLicense(key: string) {
  const [license] = await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.keyHash, digest(normalizeKey(key))))
    .limit(1);
  return license ? publicLicense(license) : null;
}

export async function recordCheckpoint(input: {
  clientVersion?: string;
  environment?: string;
}): Promise<void> {
  await recordEvent({
    eventType: "checkpoint",
    outcome: "recorded",
    clientVersion: input.clientVersion,
    environment: input.environment,
  });
}

export async function getAnalyticsSummary() {
  const now = new Date();
  const [{ totalTokens = 0 } = {}] = await db
    .select({ totalTokens: count() })
    .from(licensesTable);
  const [{ activeTokens = 0 } = {}] = await db
    .select({ activeTokens: count() })
    .from(licensesTable)
    .where(and(isNull(licensesTable.revokedAt), gt(licensesTable.expiresAt, now)));
  const [{ totalViews = 0 } = {}] = await db
    .select({ totalViews: count() })
    .from(licenseEventsTable)
    .where(eq(licenseEventsTable.eventType, "checkpoint"));
  const successfulTypes = ["activation", "validation"];
  const [{ totalValidations = 0 } = {}] = await db
    .select({ totalValidations: count() })
    .from(licenseEventsTable)
    .where(
      and(
        inArray(licenseEventsTable.eventType, successfulTypes),
        eq(licenseEventsTable.outcome, "success"),
      ),
    );

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 13);
  const dayKey = sql<string>`to_char(${licenseEventsTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const dailyRows = await db
    .select({
      date: dayKey,
      eventType: licenseEventsTable.eventType,
      outcome: licenseEventsTable.outcome,
      count: count(),
    })
    .from(licenseEventsTable)
    .where(gte(licenseEventsTable.createdAt, since))
    .groupBy(dayKey, licenseEventsTable.eventType, licenseEventsTable.outcome);

  const dailyMap = new Map<string, { pageViews: number; validations: number }>();
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + offset);
    dailyMap.set(date.toISOString().slice(0, 10), { pageViews: 0, validations: 0 });
  }
  for (const row of dailyRows) {
    const day = dailyMap.get(row.date);
    if (!day) continue;
    if (row.eventType === "checkpoint") day.pageViews += Number(row.count);
    if (successfulTypes.includes(row.eventType) && row.outcome === "success") {
      day.validations += Number(row.count);
    }
  }

  const hourKey = sql<number>`EXTRACT(HOUR FROM ${licenseEventsTable.createdAt} AT TIME ZONE 'UTC')::integer`;
  const hourlyRows = await db
    .select({ hour: hourKey, validations: count() })
    .from(licenseEventsTable)
    .where(
      and(
        inArray(licenseEventsTable.eventType, successfulTypes),
        eq(licenseEventsTable.outcome, "success"),
      ),
    )
    .groupBy(hourKey);
  const hourlyMap = new Map(hourlyRows.map((row) => [Number(row.hour), Number(row.validations)]));

  const environmentRows = await db
    .select({
      environment: sql<string>`COALESCE(${licenseEventsTable.environment}, 'unspecified')`,
      validations: count(),
    })
    .from(licenseEventsTable)
    .where(
      and(
        inArray(licenseEventsTable.eventType, successfulTypes),
        eq(licenseEventsTable.outcome, "success"),
      ),
    )
    .groupBy(sql`COALESCE(${licenseEventsTable.environment}, 'unspecified')`);

  const views = Number(totalViews);
  const validations = Number(totalValidations);
  return {
    totalTokens: Number(totalTokens),
    activeTokens: Number(activeTokens),
    totalViews: views,
    totalValidations: validations,
    conversionRate: views === 0 ? 0 : (validations / views) * 100,
    dailyTrend: [...dailyMap.entries()].map(([date, values]) => ({ date, ...values })),
    hourlyUsage: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      validations: hourlyMap.get(hour) ?? 0,
    })),
    environmentBreakdown: environmentRows.map((row) => ({
      environment: row.environment,
      validations: Number(row.validations),
    })),
  };
}

export async function listActivity(limit: number) {
  const [result] = await db
    .select({ total: count() })
    .from(licenseEventsTable);
  const rows = await db
    .select({
      id: licenseEventsTable.id,
      eventType: licenseEventsTable.eventType,
      outcome: licenseEventsTable.outcome,
      keyPreview: licenseEventsTable.keyPreview,
      clientVersion: licenseEventsTable.clientVersion,
      environment: licenseEventsTable.environment,
      createdAt: licenseEventsTable.createdAt,
    })
    .from(licenseEventsTable)
    .orderBy(desc(licenseEventsTable.createdAt))
    .limit(limit);
  return { items: rows, total: Number(result?.total ?? 0) };
}
