import { Router } from "express";
import { onboardingInfo, acceptOnboarding } from "./onboarding.controller";

const router = Router();
router.get("/:token", onboardingInfo);
router.post("/accept", acceptOnboarding);

export default router;
