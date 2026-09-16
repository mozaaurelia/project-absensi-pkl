import { Router } from "express";
import { listRoles } from "./roles.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";

const router = Router();
router.get("/", authenticate, authorize("admin"), listRoles);

export default router;