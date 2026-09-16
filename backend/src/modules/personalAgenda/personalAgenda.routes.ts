import { Router } from "express";
import * as ctrl from "./personalAgenda.controller";
import { authenticate } from "../../middlewares/authenticate";

const router = Router();
router.get("/me", authenticate, ctrl.myPersonalAgendas);
router.post("/", authenticate, ctrl.createPersonalAgenda);
router.patch("/:id", authenticate, ctrl.updatePersonalAgenda);
router.delete("/:id", authenticate, ctrl.deletePersonalAgenda);

export default router;