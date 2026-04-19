import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import authRouter from "./auth";
import driverAuthRouter from "./driver-auth";
import paymentRouter from "./payment";
import ridesRouter from "./rides";
import usersRouter from "./users";
import walletRouter from "./wallet";
import kycRouter from "./kyc";
import scheduledRouter from "./scheduled";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(driverAuthRouter);
router.use(adminRouter);
router.use(paymentRouter);
router.use(ridesRouter);
router.use(usersRouter);
router.use(walletRouter);
router.use(kycRouter);
router.use(scheduledRouter);

export default router;
