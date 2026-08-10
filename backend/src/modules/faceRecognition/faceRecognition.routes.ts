import { Router } from "express";
import { registerFaceReference, verifyFace } from "./faceRegonition.controller"
import { authenticate } from "../../middlewares/authenticate";

const router = Router();

router.post("/verify", authenticate, verifyFace);
router.post("/register", authenticate, registerFaceReference);

export default router;