// Prisma config — builds DATABASE_URL from existing DB_* env vars
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Construct DATABASE_URL from existing env vars so schema.prisma can read it
if (!process.env.DATABASE_URL) {
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "3306";
  const user = process.env.DB_USER || "root";
  const pass = process.env.DB_PASSWORD || "";
  const name = process.env.DB_NAME || "vlgc_sorter";
  process.env.DATABASE_URL = `mysql://${user}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
