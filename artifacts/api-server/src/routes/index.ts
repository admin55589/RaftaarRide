import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import authRouter from "./auth";
import paymentRouter from "./payment";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(paymentRouter);

export default router;
