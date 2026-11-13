import { Router } from "express";
import { supportController } from "../controllers/supportController.js";

const router = Router();

router.post("/request", supportController.submitRequest);

export default router;
