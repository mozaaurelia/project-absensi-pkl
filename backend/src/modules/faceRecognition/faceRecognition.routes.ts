import { Router } from "express";
import {
  registerFaceReference,
  verifyFace,
  listPendingFaceReferences,
  reviewFaceReference,
} from "./faceRegonition.controller"
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";

const router = Router();

router.post("/verify", authenticate, verifyFace);
router.post("/register", authenticate, registerFaceReference);
router.get("/pending", authenticate, authorize("admin"), listPendingFaceReferences);
router.post("/:id/review", authenticate, authorize("admin"), reviewFaceReference);

export default router;