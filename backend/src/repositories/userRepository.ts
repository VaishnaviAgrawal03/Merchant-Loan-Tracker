import { Db } from "../db/database";
import { Role, User } from "../models/types";

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  created_at: string;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  passwordHash: row.password_hash,
  createdAt: row.created_at,
});

/** All SQL for users lives here. Every query is parameterized (no string concatenation). */
export function createUserRepository(db: Db) {
  const byId = db.prepare<[number], UserRow>("SELECT * FROM users WHERE id = ?");
  const byEmail = db.prepare<[string], UserRow>("SELECT * FROM users WHERE email = ?");
  const insert = db.prepare(
    "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
  );

  return {
    create(email: string, name: string, passwordHash: string, role: Role): User {
      const info = insert.run(email, name, passwordHash, role, new Date().toISOString());
      return toUser(byId.get(Number(info.lastInsertRowid))!);
    },

    findById(id: number): User | undefined {
      const row = byId.get(id);
      return row ? toUser(row) : undefined;
    },

    findByEmail(email: string): User | undefined {
      const row = byEmail.get(email);
      return row ? toUser(row) : undefined;
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
