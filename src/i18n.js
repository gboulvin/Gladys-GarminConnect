// -----------------------------------------------------------------------------
// User-facing texts, in the four languages the integration speaks.
//
// Gladys picks the right entry of a multi-language object (`{ en, fr, ... }`)
// itself for action messages, connection statuses, widget contents and toasts:
// those are returned whole with `msg()`. Device and feature NAMES are plain
// strings stored once in Gladys, so they are resolved with `text()` in the
// language chosen in the configuration (`device_language`).
//
// `en` is mandatory everywhere (Gladys falls back to it); keep the four
// languages in sync — test/i18n.test.js checks it.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const DEFAULT_LANGUAGE = 'en';

export const MESSAGES = {
  // --- Device and feature names ---------------------------------------------
  account_device: {
    en: 'Garmin Connect - {name}',
    fr: 'Garmin Connect - {name}',
    de: 'Garmin Connect - {name}',
    es: 'Garmin Connect - {name}',
  },
  feature_steps: { en: 'Steps', fr: 'Pas', de: 'Schritte', es: 'Pasos' },
  feature_step_goal: {
    en: 'Daily step goal',
    fr: 'Objectif de pas quotidien',
    de: 'Tägliches Schrittziel',
    es: 'Objetivo diario de pasos',
  },
  feature_distance: { en: 'Distance', fr: 'Distance', de: 'Distanz', es: 'Distancia' },
  feature_active_calories: {
    en: 'Active calories (kcal)',
    fr: 'Calories actives (kcal)',
    de: 'Aktive Kalorien (kcal)',
    es: 'Calorías activas (kcal)',
  },
  feature_floors: {
    en: 'Floors climbed',
    fr: 'Étages montés',
    de: 'Gestiegene Etagen',
    es: 'Pisos subidos',
  },
  feature_intensity_minutes: {
    en: 'Intensity minutes',
    fr: "Minutes d'intensité",
    de: 'Intensitätsminuten',
    es: 'Minutos de intensidad',
  },
  feature_resting_heart_rate: {
    en: 'Resting heart rate (bpm)',
    fr: 'Fréquence cardiaque au repos (bpm)',
    de: 'Ruheherzfrequenz (bpm)',
    es: 'Frecuencia cardíaca en reposo (ppm)',
  },
  feature_stress_average: {
    en: 'Average stress level',
    fr: 'Niveau de stress moyen',
    de: 'Durchschnittliches Stresslevel',
    es: 'Nivel de estrés medio',
  },
  feature_body_battery: {
    en: 'Body Battery',
    fr: 'Body Battery',
    de: 'Body Battery',
    es: 'Body Battery',
  },
  feature_spo2: {
    en: 'Average SpO2',
    fr: 'SpO2 moyenne',
    de: 'Durchschnittliche SpO2',
    es: 'SpO2 media',
  },
  feature_respiration: {
    en: 'Respiration rate (brpm)',
    fr: 'Fréquence respiratoire (rpm)',
    de: 'Atemfrequenz (Atemzüge/min)',
    es: 'Frecuencia respiratoria (rpm)',
  },
  feature_sleep_duration: {
    en: 'Sleep duration',
    fr: 'Durée de sommeil',
    de: 'Schlafdauer',
    es: 'Duración del sueño',
  },
  feature_sleep_score: {
    en: 'Sleep score',
    fr: 'Score de sommeil',
    de: 'Schlafwert',
    es: 'Puntuación del sueño',
  },
  feature_hrv: {
    en: 'HRV (last night average)',
    fr: 'VFC (moyenne de la nuit)',
    de: 'HFV (Durchschnitt letzte Nacht)',
    es: 'VFC (media de la noche)',
  },
  feature_training_readiness: {
    en: 'Training readiness',
    fr: "Disposition à l'entraînement",
    de: 'Trainingsbereitschaft',
    es: 'Preparación para entrenar',
  },
  feature_weight: { en: 'Weight (kg)', fr: 'Poids (kg)', de: 'Gewicht (kg)', es: 'Peso (kg)' },
  feature_body_fat: {
    en: 'Body fat',
    fr: 'Masse grasse',
    de: 'Körperfett',
    es: 'Grasa corporal',
  },
  feature_bmi: { en: 'BMI', fr: 'IMC', de: 'BMI', es: 'IMC' },
  feature_since_last_sync: {
    en: 'Time since last sync',
    fr: 'Temps depuis la dernière synchronisation',
    de: 'Zeit seit der letzten Synchronisierung',
    es: 'Tiempo desde la última sincronización',
  },
  feature_last_used: {
    en: 'Last synced device',
    fr: 'Dernier appareil synchronisé',
    de: 'Zuletzt synchronisiertes Gerät',
    es: 'Último dispositivo sincronizado',
  },

  // --- Connection status ------------------------------------------------------
  status_not_configured: {
    en: 'Enter the email and password of your Garmin Connect account, then save.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte Garmin Connect, puis enregistrez.',
    de: 'Geben Sie die E-Mail-Adresse und das Passwort Ihres Garmin Connect-Kontos ein und speichern Sie.',
    es: 'Introduzca el correo y la contraseña de su cuenta Garmin Connect y guarde.',
  },
  status_mfa_required: {
    en: 'Garmin sent you a verification code: enter it in the "Sign in" action.',
    fr: 'Garmin vous a envoyé un code de vérification : saisissez-le dans l’action « Se connecter ».',
    de: 'Garmin hat Ihnen einen Bestätigungscode gesendet: Geben Sie ihn in der Aktion „Anmelden“ ein.',
    es: 'Garmin le ha enviado un código de verificación: introdúzcalo en la acción «Iniciar sesión».',
  },
  status_auth_failed: {
    en: 'Garmin refused the sign-in: check your email and password.',
    fr: 'Garmin a refusé la connexion : vérifiez votre e-mail et votre mot de passe.',
    de: 'Garmin hat die Anmeldung abgelehnt: Prüfen Sie E-Mail-Adresse und Passwort.',
    es: 'Garmin rechazó el inicio de sesión: compruebe su correo y su contraseña.',
  },
  status_session_expired: {
    en: 'The Garmin session expired: use the "Sign in" action again.',
    fr: 'La session Garmin a expiré : utilisez à nouveau l’action « Se connecter ».',
    de: 'Die Garmin-Sitzung ist abgelaufen: Verwenden Sie erneut die Aktion „Anmelden“.',
    es: 'La sesión de Garmin ha caducado: utilice de nuevo la acción «Iniciar sesión».',
  },
  status_blocked: {
    en: 'Garmin is temporarily blocking sign-ins from this network. Retry later.',
    fr: 'Garmin bloque temporairement les connexions depuis ce réseau. Réessayez plus tard.',
    de: 'Garmin blockiert vorübergehend Anmeldungen aus diesem Netzwerk. Versuchen Sie es später erneut.',
    es: 'Garmin bloquea temporalmente los inicios de sesión desde esta red. Vuelva a intentarlo más tarde.',
  },
  status_unreachable: {
    en: 'Garmin Connect is unreachable: {error}',
    fr: 'Garmin Connect est injoignable : {error}',
    de: 'Garmin Connect ist nicht erreichbar: {error}',
    es: 'Garmin Connect no está disponible: {error}',
  },

  // --- Configuration screen actions ------------------------------------------
  action_signed_in: {
    en: 'Signed in as {name}: {devices} Garmin device(s) found.',
    fr: 'Connecté en tant que {name} : {devices} appareil(s) Garmin trouvé(s).',
    de: 'Angemeldet als {name}: {devices} Garmin-Gerät(e) gefunden.',
    es: 'Sesión iniciada como {name}: {devices} dispositivo(s) Garmin encontrado(s).',
  },
  action_mfa_sent: {
    en: 'Garmin sent a verification code ({method}). Run "Sign in" again with this code.',
    fr: 'Garmin a envoyé un code de vérification ({method}). Relancez « Se connecter » avec ce code.',
    de: 'Garmin hat einen Bestätigungscode gesendet ({method}). Führen Sie „Anmelden“ mit diesem Code erneut aus.',
    es: 'Garmin ha enviado un código de verificación ({method}). Vuelva a ejecutar «Iniciar sesión» con este código.',
  },
  action_mfa_no_pending: {
    en: 'No sign-in is waiting for a code: run "Sign in" with an empty code first.',
    fr: 'Aucune connexion n’attend de code : lancez d’abord « Se connecter » sans code.',
    de: 'Keine Anmeldung wartet auf einen Code: Führen Sie zuerst „Anmelden“ ohne Code aus.',
    es: 'Ningún inicio de sesión espera un código: ejecute primero «Iniciar sesión» sin código.',
  },
  action_missing_credentials: {
    en: 'Save your Garmin Connect email and password first.',
    fr: 'Enregistrez d’abord l’e-mail et le mot de passe de votre compte Garmin Connect.',
    de: 'Speichern Sie zuerst die E-Mail-Adresse und das Passwort Ihres Garmin Connect-Kontos.',
    es: 'Guarde primero el correo y la contraseña de su cuenta Garmin Connect.',
  },
  action_test_ok: {
    en: 'Connection OK: {name}, {steps} steps today, last sync {time}.',
    fr: 'Connexion OK : {name}, {steps} pas aujourd’hui, dernière synchro {time}.',
    de: 'Verbindung OK: {name}, heute {steps} Schritte, letzte Synchronisierung {time}.',
    es: 'Conexión correcta: {name}, {steps} pasos hoy, última sincronización {time}.',
  },
  action_synced: {
    en: 'Synchronized: {devices} device(s), {steps} steps today.',
    fr: 'Synchronisé : {devices} appareil(s), {steps} pas aujourd’hui.',
    de: 'Synchronisiert: {devices} Gerät(e), heute {steps} Schritte.',
    es: 'Sincronizado: {devices} dispositivo(s), {steps} pasos hoy.',
  },
  action_signed_out: {
    en: 'Signed out: the Garmin session was deleted from Gladys.',
    fr: 'Déconnecté : la session Garmin a été supprimée de Gladys.',
    de: 'Abgemeldet: Die Garmin-Sitzung wurde aus Gladys gelöscht.',
    es: 'Sesión cerrada: la sesión de Garmin se eliminó de Gladys.',
  },

  // --- Widgets -----------------------------------------------------------------
  widget_not_connected: {
    en: 'Not connected to Garmin Connect yet: open the integration configuration.',
    fr: 'Pas encore connecté à Garmin Connect : ouvrez la configuration de l’intégration.',
    de: 'Noch nicht mit Garmin Connect verbunden: Öffnen Sie die Konfiguration der Integration.',
    es: 'Aún no conectado a Garmin Connect: abra la configuración de la integración.',
  },
  widget_steps: { en: 'Steps', fr: 'Pas', de: 'Schritte', es: 'Pasos' },
  widget_body_battery: {
    en: 'Body Battery',
    fr: 'Body Battery',
    de: 'Body Battery',
    es: 'Body Battery',
  },
  widget_resting_hr: { en: 'Resting HR', fr: 'FC repos', de: 'Ruhe-HF', es: 'FC reposo' },
  widget_sleep_score: { en: 'Sleep', fr: 'Sommeil', de: 'Schlaf', es: 'Sueño' },
  widget_stress: { en: 'Stress', fr: 'Stress', de: 'Stress', es: 'Estrés' },
  widget_distance: { en: 'Distance', fr: 'Distance', de: 'Distanz', es: 'Distancia' },
  widget_account: { en: 'Account', fr: 'Compte', de: 'Konto', es: 'Cuenta' },
  widget_last_sync: {
    en: 'Last sync',
    fr: 'Dernière synchro',
    de: 'Letzte Synchronisierung',
    es: 'Última sincronización',
  },
  widget_last_activity: {
    en: 'Last activity',
    fr: 'Dernière activité',
    de: 'Letzte Aktivität',
    es: 'Última actividad',
  },
  widget_step_goal: {
    en: 'Step goal',
    fr: 'Objectif de pas',
    de: 'Schrittziel',
    es: 'Objetivo de pasos',
  },
  widget_never: { en: 'Never', fr: 'Jamais', de: 'Nie', es: 'Nunca' },
  widget_none: { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguna' },
  widget_sync_now: {
    en: 'Sync now',
    fr: 'Synchroniser',
    de: 'Jetzt synchron.',
    es: 'Sincronizar',
  },
  widget_open_garmin: {
    en: 'Open in Garmin Connect',
    fr: 'Voir sur Garmin Connect',
    de: 'In Garmin Connect öffnen',
    es: 'Ver en Garmin Connect',
  },
  widget_no_activity: {
    en: 'No activity recorded yet.',
    fr: 'Aucune activité enregistrée pour le moment.',
    de: 'Noch keine Aktivität aufgezeichnet.',
    es: 'Todavía no hay actividades registradas.',
  },
  widget_activity_details: {
    en: 'Duration: {duration}\nDistance: {distance}\nCalories: {calories}\nAverage heart rate: {hr}',
    fr: 'Durée : {duration}\nDistance : {distance}\nCalories : {calories}\nFréquence cardiaque moyenne : {hr}',
    de: 'Dauer: {duration}\nDistanz: {distance}\nKalorien: {calories}\nDurchschnittliche Herzfrequenz: {hr}',
    es: 'Duración: {duration}\nDistancia: {distance}\nCalorías: {calories}\nFrecuencia cardíaca media: {hr}',
  },
  widget_sync_done: {
    en: 'Garmin Connect synchronized.',
    fr: 'Garmin Connect synchronisé.',
    de: 'Garmin Connect synchronisiert.',
    es: 'Garmin Connect sincronizado.',
  },

  // --- Activity types (scene trigger filter, widgets) -------------------------
  activity_running: { en: 'Running', fr: 'Course à pied', de: 'Laufen', es: 'Carrera' },
  activity_cycling: { en: 'Cycling', fr: 'Vélo', de: 'Radfahren', es: 'Ciclismo' },
  activity_walking: { en: 'Walking', fr: 'Marche', de: 'Gehen', es: 'Caminata' },
  activity_hiking: { en: 'Hiking', fr: 'Randonnée', de: 'Wandern', es: 'Senderismo' },
  activity_swimming: { en: 'Swimming', fr: 'Natation', de: 'Schwimmen', es: 'Natación' },
  activity_strength: {
    en: 'Strength training',
    fr: 'Renforcement musculaire',
    de: 'Krafttraining',
    es: 'Entrenamiento de fuerza',
  },
  activity_other: { en: 'Other', fr: 'Autre', de: 'Andere', es: 'Otra' },
};

/**
 * Multi-language object of a message, with its `{placeholders}` filled in.
 * @param {keyof typeof MESSAGES} key
 * @param {Record<string, string | number>} [vars]
 * @returns {{ en: string, fr: string, de: string, es: string }}
 */
export function msg(key, vars = {}) {
  const entry = MESSAGES[key];
  if (!entry) {
    throw new Error(`Unknown message key: ${key}`);
  }
  return Object.fromEntries(
    Object.entries(entry).map(([lang, template]) => [lang, interpolate(template, vars)]),
  );
}

/**
 * One language of a message (device and feature names), English fallback.
 * @param {keyof typeof MESSAGES} key
 * @param {string} language
 * @param {Record<string, string | number>} [vars]
 */
export function text(key, language, vars = {}) {
  const entry = MESSAGES[key];
  if (!entry) {
    throw new Error(`Unknown message key: ${key}`);
  }
  return interpolate(entry[language] ?? entry[DEFAULT_LANGUAGE], vars);
}

/**
 * Build a multi-language object from a function of the language: for the
 * texts that need per-language formatting (numbers, dates).
 * @param {(language: string) => string} build
 */
export function perLanguage(build) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));
}

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name]),
  );
}
