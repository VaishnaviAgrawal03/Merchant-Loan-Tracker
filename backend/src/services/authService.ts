import bcrypt from "bcryptjs";
import { AuthUser, PublicUser, User } from "../models/types";
import { UserRepository } from "../repositories/userRepository";
import { AppError } from "../utils/AppError";
import { isUniqueViolation } from "../utils/dbErrors";
import { signToken } from "../utils/jwt";

const BCRYPT_ROUNDS = 10;
// Compared against when the email doesn't exist, so a wrong email takes as long as a wrong password.
// This stops attackers from discovering which emails are registered by timing the response.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export interface Session {
  token: string;
  user: PublicUser;
}

const toPublic = ({ id, email, name, role }: User): PublicUser => ({ id, email, name, role });

export function createAuthService(users: UserRepository) {
  function session(user: User): Session {
    return { token: signToken({ id: user.id, role: user.role }), user: toPublic(user) };
  }

  return {
    /** Self-registration always creates a merchant. Reviewers are created by the seed/admin only. */
    async register(input: { email: string; name: string; password: string }): Promise<Session> {
      if (users.findByEmail(input.email)) throw new AppError(409, "Email already registered");
      const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
      try {
        return session(users.create(input.email, input.name, hash, "merchant"));
      } catch (err) {
        // Two sign-ups for the same email can both pass the check above while bcrypt runs.
        // The UNIQUE constraint stops the second one; report it as the same 409, not a 500.
        if (isUniqueViolation(err)) throw new AppError(409, "Email already registered");
        throw err;
      }
    },

    async login(email: string, password: string): Promise<Session> {
      const user = users.findByEmail(email);
      const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !passwordMatches) throw new AppError(401, "Invalid email or password");
      return session(user);
    },

    me(actor: AuthUser): PublicUser {
      const user = users.findById(actor.id);
      if (!user) throw new AppError(401, "Unauthorized");
      return toPublic(user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
