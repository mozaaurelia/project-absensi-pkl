import { Router } from "express";
import * as ctrl from "./overtime.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";

const router = Router();
router.post("/", authenticate, ctrl.createOvertimeRequest);
router.get("/me", authenticate, ctrl.myOvertimeRequests);
router.get("/team", authenticate, authorize("supervisor", "admin"), ctrl.teamOvertimeRequests);
router.patch("/:id/approve", authenticate, authorize("supervisor", "admin"), ctrl.approveOvertimeRequest);
router.patch("/:id/reject", authenticate, authorize("supervisor", "admin"), ctrl.rejectOvertimeRequest);

export default router;