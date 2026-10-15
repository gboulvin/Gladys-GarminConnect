// -----------------------------------------------------------------------------
// Persistence of the Garmin session tokens, under /data (the only writable
// volume of the container): a restart or an update of the integration keeps
// the session, so Garmin is not asked for the password (and an MFA code)
// again. The file is owner-only (0600) and bound to the account it was opened
// for: changing the email or the domain in the configuration discards it.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_DATA_DIR = process.env.GARMIN_DATA_DIR ?? '/data';
const FILE_NAME = 'garmin-session.json';

export class TokenStore {
  constructor(dataDir = DEFAULT_DATA_DIR) {
    this.file = path.join(dataDir, FILE_NAME);
  }

  /** Tokens saved for this account, or null. */
  async load({ email, domain }) {
    let saved;
    try {
      saved = JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      return null;
    }
    if (
      !saved?.tokens?.access_token ||
      saved.email?.toLowerCase() !== String(email ?? '').toLowerCase() ||
      saved.domain !== domain
    ) {
      return null;
    }
    return saved.tokens;
  }

  async save({ email, domain }, tokens) {
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    // Write then rename: a crash never leaves a truncated session file.
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ email, domain, tokens }), { mode: 0o600 });
    await rename(temporary, this.file);
  }

  async clear() {
    await rm(this.file, { force: true });
  }
}
