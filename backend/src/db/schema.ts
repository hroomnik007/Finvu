import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  numeric,
  date,
  integer,
  serial,
  check,
  unique,
  index,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  name: varchar("name", { length: 100 }).notNull(),
  googleId: varchar("google_id", { length: 255 }),
  emailVerified: boolean("email_verified").default(false).notNull(),
  verificationToken: varchar("verification_token", { length: 255 }),
  verificationExpiresAt: timestamp("verification_expires_at"),
  resetToken: varchar("reset_token", { length: 255 }),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  avatarUrl: text("avatar_url"),
  role: varchar("role", { length: 20 }).default("user").notNull(),
  weeklyEmailEnabled: boolean("weekly_email_enabled").default(false).notNull(),
  monthlyEmailEnabled: boolean("monthly_email_enabled").default(false).notNull(),
  // 'personal' | 'family' content, send hour (Europe/Bratislava), last month sent ("YYYY-MM")
  monthlyEmailScope: varchar("monthly_email_scope", { length: 10 }).default("personal").notNull(),
  monthlyEmailHour: integer("monthly_email_hour").default(9).notNull(),
  monthlyEmailLastSent: varchar("monthly_email_last_sent", { length: 7 }),
  onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
  currentStreak: integer("current_streak").default(0).notNull(),
  longestStreak: integer("longest_streak").default(0).notNull(),
  lastActivityDate: date("last_activity_date"),
  badges: text("badges").array().default(sql`ARRAY[]::text[]`).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  pinHash: varchar("pin_hash", { length: 255 }),
  defaultPage: varchar("default_page", { length: 50 }).default("dashboard"),
  currencyFormat: varchar("currency_format", { length: 10 }).default("sk"),
  householdId: integer("household_id"),
  householdEnabled: boolean("household_enabled").default(false),
  savingsEnabled: boolean("savings_enabled").default(false),
  theme: varchar("theme", { length: 20 }).default("dark"),
  language: varchar("language", { length: 10 }).default("sk"),
  trackingStartDate: date("tracking_start_date"),
  onboardingBannerDismissed: boolean("onboarding_banner_dismissed").default(false).notNull(),
  lastActiveAt: timestamp("last_active_at"),
  autoLockMinutes: integer("auto_lock_minutes"),
  isDeactivated: boolean("is_deactivated").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  // Set when a just-rotated token was legitimately presented once more inside the
  // grace window; any further use of the same token counts as replay.
  graceUsedAt: timestamp("grace_used_at"),
  // Session (device) this token belongs to; deleting the session deletes the token.
  sessionId: uuid("session_id").references(() => userSessions.id, { onDelete: "cascade" }),
}, (t) => [index("refresh_tokens_user_id_idx").on(t.userId)]);

export const households = pgTable("households", {
  id:         serial("id").primaryKey(),
  name:       varchar("name", { length: 100 }).notNull(),
  inviteCode: varchar("invite_code", { length: 20 }).notNull().unique(),
  createdBy:  uuid("created_by").notNull().references(() => users.id),
  createdAt:  timestamp("created_at").defaultNow(),
});

export const householdMembers = pgTable("household_members", {
  id:          serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt:    timestamp("joined_at").defaultNow(),
}, (t) => [unique("household_members_unq").on(t.householdId, t.userId)]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    type: varchar("type", { length: 10 }).notNull(),
    color: varchar("color", { length: 7 }),
    icon: varchar("icon", { length: 50 }),
    isDefault: boolean("is_default").default(false).notNull(),
    budgetLimit: numeric("budget_limit"),
    autoLimit: boolean("auto_limit").default(true).notNull(),
    // Added on top of the fixed-expense total when auto_limit is on.
    limitReserve: numeric("limit_reserve", { precision: 12, scale: 2 }).default("0").notNull(),
    // Same-named category of every sharing household member, with one common limit.
    shared: boolean("shared").default(false).notNull(),
    sortOrder: integer("sort_order"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    check("categories_type_check", sql`${t.type} IN ('income', 'expense')`),
    index("categories_user_id_idx").on(t.userId),
  ]
);

// Import rules: a keyword in a statement description assigns a category.
export const categoryRules = pgTable(
  "category_rules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyword: varchar("keyword", { length: 100 }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("category_rules_user_keyword").on(t.userId, t.keyword), index("category_rules_user_id_idx").on(t.userId)]
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 10 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    description: varchar("description", { length: 500 }),
    date: date("date").notNull(),
    isFixed: boolean("is_fixed").default(false).notNull(),
    // First day of the first month a recurring series no longer applies (null = running)
    endedOn: date("ended_on"),
    householdId: integer("household_id").references(() => households.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    check("transactions_type_check", sql`${t.type} IN ('income', 'expense')`),
    index("transactions_user_id_idx").on(t.userId),
    index("transactions_date_idx").on(t.date),
    index("transactions_household_id_idx").on(t.householdId),
  ]
);

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  deviceType: varchar("device_type", { length: 32 }),
  backedUp: boolean("backed_up").default(false).notNull(),
  name: varchar("name", { length: 100 }).default("Biometrický kľúč").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sharedReports = pgTable("shared_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  data: text("data").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const savingsGoals = pgTable("savings_goals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  targetAmount: numeric("target_amount", { precision: 12, scale: 2 }).notNull(),
  savedAmount: numeric("saved_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  deadline: date("deadline"),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 7 }),
  note: varchar("note", { length: 500 }),
  paused: boolean("paused").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type SharedReport = typeof sharedReports.$inferSelect;
export type WebAuthnCredential = typeof webauthnCredentials.$inferSelect;
export type NewWebAuthnCredential = typeof webauthnCredentials.$inferInsert;
export type Household = typeof households.$inferSelect;
export type NewHousehold = typeof households.$inferInsert;
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type NewSavingsGoal = typeof savingsGoals.$inferInsert;

export const savingsDeposits = pgTable("savings_deposits", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  goalId: uuid("goal_id").notNull().references(() => savingsGoals.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type SavingsDeposit = typeof savingsDeposits.$inferSelect;

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceName: varchar("device_name", { length: 255 }),
  browser: varchar("browser", { length: 100 }),
  ip: varchar("ip", { length: 50 }),
  location: varchar("location", { length: 255 }),
  lastActive: timestamp("last_active").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type UserSession = typeof userSessions.$inferSelect;

export const notificationsDismissed = pgTable("notifications_dismissed", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  notificationKey: varchar("notification_key", { length: 255 }).notNull(),
  dismissedAt: timestamp("dismissed_at").notNull().defaultNow(),
}, (t) => [
  unique("notifications_dismissed_unq").on(t.userId, t.notificationKey),
  index("notifications_dismissed_user_id_idx").on(t.userId),
]);
export type NotificationDismissed = typeof notificationsDismissed.$inferSelect;

// Subscription suggestions the user hid, per normalized merchant name (lib/subscriptions.ts)
export const subscriptionDismissals = pgTable("subscription_dismissals", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  patternKey: varchar("pattern_key", { length: 120 }).notNull(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.patternKey] })]);

export const userAchievements = pgTable("user_achievements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  achievementKey: varchar("achievement_key", { length: 50 }).notNull(),
  unlockedAt: timestamp("unlocked_at").notNull().defaultNow(),
}, (t) => [
  unique("user_achievements_unq").on(t.userId, t.achievementKey),
  index("user_achievements_user_id_idx").on(t.userId),
]);
export type UserAchievement = typeof userAchievements.$inferSelect;

// One row per device that has completed PIN setup on this account. PIN login
// (POST /api/auth/pin-login) requires a valid, unexpired token here IN
// ADDITION to the correct PIN — a bare email+PIN from an unrecognized device
// is rejected outright. Rows are pruned whenever the PIN is changed/removed
// or the account's password is changed/reset (see auth.controller.ts).
export const pinDeviceTokens = pgTable("pin_device_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (t) => [index("pin_device_tokens_user_id_idx").on(t.userId)]);
export type PinDeviceToken = typeof pinDeviceTokens.$inferSelect;

// Failed sign-in attempts per account, independent of the per-IP rate limiters.
// key is "pw:<sha256 of normalized email>" (also for e-mails with no account),
// "pin:<user id>" or "admin". See lib/loginLockout.ts.
export const loginLockouts = pgTable("login_lockouts", {
  key: varchar("key", { length: 80 }).primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
}, (t) => [index("login_lockouts_window_started_at_idx").on(t.windowStartedAt)]);

// Idempotency-Key records for create endpoints (middleware/idempotency.ts).
// responseStatus is null while the first request is still running.
export const idempotencyKeys = pgTable("idempotency_keys", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 100 }).notNull(),
  requestMethod: varchar("request_method", { length: 10 }).notNull(),
  requestPath: varchar("request_path", { length: 200 }).notNull(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("idempotency_keys_user_key_unique").on(t.userId, t.key),
  index("idempotency_keys_created_at_idx").on(t.createdAt),
]);
