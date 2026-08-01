
import {neon} from "@neondatabase/serverless";
import {drizzle} from "drizzle-orm/node-postgres";
import 'dotenv/config'

if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL');
}

let sql = neon(process.env.DATABASE_URL);
export const db = drizzle(process.env.DATABASE_URL)