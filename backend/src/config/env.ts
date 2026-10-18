import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("noreply@finvu.pedani.eu"),
  APP_URL: z.string().default("https://finvu.pedani.eu"),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(12),
  JWT_ADMIN_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  // Default to the host/origin of APP_URL; override only for unusual setups.
  WEBAUTHN_RP_ID: z.string().optional(),
  WEBAUTHN_ORIGIN: z.string().optional(),
  UPLOAD_DIR: z.string().default("uploads"),
});

export const env = envSchema.parse(process.env);
