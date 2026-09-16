import { Router } from "express";
import * as ctrl from "./task.controller";
import { authenticate } from "../../middlewares/authenticate";

const router = Router();
router.get("/me", authenticate, ctrl.myTasks);
router.post("/", authenticate, ctrl.createTask);
router.patch("/:id", authenticate, ctrl.updateTask);
router.delete("/:id", authenticate, ctrl.deleteTask);

export default router;
