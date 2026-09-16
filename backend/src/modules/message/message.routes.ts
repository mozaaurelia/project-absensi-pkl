import { Router } from "express";
import {
  myMessages,
  listDmConversations,
  getDmHistory,
  markDmRead,
} from "./message.controller";
import { authenticate } from "../../middlewares/authenticate";

const router = Router();
router.get("/me", authenticate, myMessages);
router.get("/dm/conversations", authenticate, listDmConversations);
router.get("/dm/:partnerId/messages", authenticate, getDmHistory);
router.post("/dm/:partnerId/read", authenticate, markDmRead);

export default router;
