import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

function allowedAdminIds(): Set<string> {
  return new Set(
    (process.env.LICENSE_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isLicenseAdmin(userId: string): boolean {
  return allowedAdminIds().has(userId);
}

function originMatchesHost(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return false;
  const forwardedHost = req.get("x-forwarded-host");
  const expectedHost = (forwardedHost ?? req.get("host") ?? "")
    .split(",")[0]
    .trim();
  if (!expectedHost) return false;
  try {
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

export function requireSignedIn(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }
  res.locals.userId = userId;
  next();
}

export function requireLicenseAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }
  if (!isLicenseAdmin(userId)) {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !originMatchesHost(req)) {
    res.status(403).json({ error: "Request origin was not accepted" });
    return;
  }
  res.locals.userId = userId;
  next();
}
