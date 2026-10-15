// -----------------------------------------------------------------------------
// Errors of the Garmin Connect client. The integration maps each of them to a
// connection status the user can act on (see src/garmin/service.js).
// -----------------------------------------------------------------------------

export class GarminError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

/** Credentials refused, or a session Garmin no longer accepts: re-sign-in needed. */
export class GarminAuthError extends GarminError {}

/** The sign-in needs the verification code Garmin just sent (MFA). */
export class GarminMfaRequiredError extends GarminError {
  constructor(method = 'email') {
    super(`Garmin requires a verification code (${method})`);
    this.method = method;
  }
}

/** Garmin (or its Cloudflare front) rate limits or blocks this client. */
export class GarminBlockedError extends GarminError {}

/** Any other HTTP failure of the Garmin API. */
export class GarminApiError extends GarminError {}
