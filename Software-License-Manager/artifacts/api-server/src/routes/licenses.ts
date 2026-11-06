import rateLimit from "express-rate-limit";
import { Router, type IRouter } from "express";
import {
  CreateLicenseBody,
  CreateLicenseResponse,
  GetAdminMeResponse,
  GetAnalyticsSummaryResponse,
  ListActivityQueryParams,
  ListActivityResponse,
  ListLicensesQueryParams,
  ListLicensesResponse,
  ResetLicenseDeviceParams,
  ResetLicenseDeviceResponse,
  RevokeLicenseParams,
  RevokeLicenseResponse,
  TrackCheckpointBody,
  TrackCheckpointResponse,
  VerifyLicenseKeyBody,
  VerifyLicenseKeyResponse,
} from "@workspace/api-zod";
import { getAuth } from "@clerk/express";
import {
  getAnalyticsSummary,
  issueLicense,
  listActivity,
  listLicenses,
  recordCheckpoint,
  resetLicenseDevice,
  revokeLicense,
  verifyLicense,
} from "../lib/licenseService";
import { isLicenseAdmin, requireLicenseAdmin, requireSignedIn } from "../middlewares/licenseAuth";

const router: IRouter = Router();

const verifyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many verification requests. Try again shortly." },
});

const checkpointLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many checkpoint requests. Try again shortly." },
});

router.get("/admin/me", requireSignedIn, (req, res): void => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }
  res.json(GetAdminMeResponse.parse({ userId, isAdmin: isLicenseAdmin(userId) }));
});

router.get("/licenses", requireLicenseAdmin, async (req, res): Promise<void> => {
  const query = ListLicensesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const data = await listLicenses(query.data);
  res.json(ListLicensesResponse.parse(data));
});

router.post("/licenses", requireLicenseAdmin, async (req, res): Promise<void> => {
  const body = CreateLicenseBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const created = await issueLicense({
    ...body.data,
    actorId: String(res.locals.userId),
  });
  res.status(201).json(CreateLicenseResponse.parse(created));
});

router.post("/licenses/:id/revoke", requireLicenseAdmin, async (req, res): Promise<void> => {
  const params = RevokeLicenseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const license = await revokeLicense(params.data.id, String(res.locals.userId));
  if (!license) {
    res.status(404).json({ error: "License not found" });
    return;
  }
  res.json(RevokeLicenseResponse.parse(license));
});

router.post(
  "/licenses/:id/reset-device",
  requireLicenseAdmin,
  async (req, res): Promise<void> => {
    const params = ResetLicenseDeviceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const license = await resetLicenseDevice(
      params.data.id,
      String(res.locals.userId),
    );
    if (!license) {
      res.status(404).json({ error: "License not found" });
      return;
    }
    res.json(ResetLicenseDeviceResponse.parse(license));
  },
);

router.get("/analytics/summary", requireLicenseAdmin, async (_req, res): Promise<void> => {
  const summary = await getAnalyticsSummary();
  res.json(GetAnalyticsSummaryResponse.parse(summary));
});

router.get("/activity", requireLicenseAdmin, async (req, res): Promise<void> => {
  const query = ListActivityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const events = await listActivity(query.data.limit);
  res.json(ListActivityResponse.parse(events));
});

router.post("/key/verify", verifyLimiter, async (req, res): Promise<void> => {
  const body = VerifyLicenseKeyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = await verifyLicense(body.data);
  res.json(VerifyLicenseKeyResponse.parse(result));
});

router.post("/track/checkpoint", checkpointLimiter, async (req, res): Promise<void> => {
  const body = TrackCheckpointBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  await recordCheckpoint(body.data);
  res.status(201).json(TrackCheckpointResponse.parse({ tracked: true }));
});

export default router;
