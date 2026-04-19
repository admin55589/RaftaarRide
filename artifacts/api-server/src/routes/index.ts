import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import authRouter from "./auth";
import paymentRouter from "./payment";
import ridesRouter from "./rides";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(paymentRouter);
router.use(ridesRouter);
router.use(usersRouter);

export default router;
