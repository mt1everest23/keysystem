import { Router, type IRouter } from "express";
import healthRouter from "./health";
import licensesRouter from "./licenses";

const router: IRouter = Router();

router.use(healthRouter);
router.use(licensesRouter);

export default router;
