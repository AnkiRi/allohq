import { assertDisposableDatabaseUrl } from "./assert-disposable-database.mjs";

const result = assertDisposableDatabaseUrl(process.env.TEST_DATABASE_URL);
console.log(`TEST_DATABASE_URL is disposable: database "${result.name}" on "${result.host}"`);
