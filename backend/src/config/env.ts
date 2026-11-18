import dotenv from "dotenv";
import { loadEnv } from "./envSchema";

dotenv.config();

// Schema and secret rules live in envSchema.ts (no side effects there).
export const env = loadEnv(process.env);
