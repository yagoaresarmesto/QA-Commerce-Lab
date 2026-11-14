import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Loads apps/api/.env for local development. Variables already present in the environment win.
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
