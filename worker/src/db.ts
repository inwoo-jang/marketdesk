import { createDb } from "@reportlens/db";
import { env } from "./env.js";

export const db = createDb(env.databaseUrl);
