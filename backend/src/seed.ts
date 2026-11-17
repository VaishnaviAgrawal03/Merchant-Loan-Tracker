import bcrypt from "bcryptjs";
import { UserRepository } from "./repositories/userRepository";

/** Demo accounts for local development and the end-to-end test. Never use these in production. */
export const DEMO_PASSWORD = "Passw0rd!";
export const DEMO_REVIEWER_EMAIL = "reviewer@demo.com";
export const DEMO_MERCHANT_EMAIL = "merchant@demo.com";

export function seedDemoUsers(users: UserRepository): void {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  if (!users.findByEmail(DEMO_REVIEWER_EMAIL)) users.create(DEMO_REVIEWER_EMAIL, "Demo Reviewer", hash, "reviewer");
  if (!users.findByEmail(DEMO_MERCHANT_EMAIL)) users.create(DEMO_MERCHANT_EMAIL, "Demo Merchant", hash, "merchant");
}
