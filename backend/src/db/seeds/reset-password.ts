/**
 * Reset any user's password directly in the DB — for when you are locked out and the
 * email reset flow is not an option (SMTP off, inbox lost, code expired).
 *
 *   npm run reset:password                          # asks for both
 *   npm run reset:password -- you@example.com       # asks for the password only
 *   npm run reset:password -- you@example.com "new-password"
 *
 * Connects with MONGO_URI from backend/.env, so it hits whatever that points at
 * (Atlas in our case). The password prompt echoes nothing, so it never lands in
 * shell history — pass it as an argument only if you do not care about that.
 */
import { createInterface } from 'node:readline';
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { User } from '../../modules/auth/user.model.js';

/** Same floor the register/login schema enforces (src/shared/schemas/auth.ts). */
const MIN_PASSWORD = 8;
/** Same cost factor auth.service.ts hashes with — keep them in step. */
const BCRYPT_ROUNDS = 10;

/** The email is user input going into a $regex — neutralise any pattern characters. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ask(question: string, { hidden = false } = {}): Promise<string> {
  // Without a terminal there is nobody to answer: fail loudly instead of hanging
  // forever on a prompt nobody can see (CI, `< /dev/null`, piped runs).
  if (!process.stdin.isTTY)
    return Promise.reject(new Error(`Not a terminal — pass it as an argument instead: ${question.trim()}`));

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const internal = rl as unknown as { _writeToOutput: (chunk: string) => void };
    const write = internal._writeToOutput.bind(rl);
    internal._writeToOutput = (chunk: string) => write(chunk.includes(question) ? chunk : '');
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      if (hidden) process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function run(): Promise<void> {
  const [argEmail, argPassword] = process.argv.slice(2);
  await connectDb();

  const email = (argEmail ?? (await ask('Email: '))).trim().toLowerCase();
  if (!email) throw new Error('No email given');

  const user = await User.findOne({ email });
  if (!user) {
    // Most lockouts are a typo or a forgotten alias, so search for near matches on the
    // local part (before the @) rather than dumping an arbitrary slice of the collection.
    const localPart = email.split('@')[0] ?? email;
    const near = await User.find({ email: { $regex: escapeRegex(localPart), $options: 'i' } })
      .select('email role status')
      .limit(20)
      .lean();
    logger.error(`No user with email "${email}". Total accounts: ${await User.countDocuments()}.`);
    if (near.length) {
      logger.info(`Did you mean one of these ${near.length}?`);
      for (const u of near) logger.info(`  ${u.email}  —  ${u.role}${u.status === 'active' ? '' : ` (${u.status})`}`);
    } else {
      logger.info('No similar email either — that account may never have been created.');
    }
    await disconnectDb();
    process.exitCode = 1;
    return;
  }

  const password = argPassword ?? (await ask(`New password for ${email}: `, { hidden: true }));
  if (password.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters`);

  user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Any half-finished "forgot password" code must not stay usable afterwards.
  user.set('resetCode', undefined);
  user.set('resetExpires', undefined);
  await user.save();

  logger.info(`Password updated for ${user.email} (role: ${user.role}, status: ${user.status}).`);
  logger.info('Already-issued access tokens stay valid until they expire — log out and back in.');
  await disconnectDb();
}

run().catch(async (err: unknown) => {
  logger.error({ err }, 'reset-password failed');
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
