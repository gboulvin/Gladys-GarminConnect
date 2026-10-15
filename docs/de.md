# Garmin Connect

Ihr Garmin-Konto in Gladys: die Gesundheitswerte des Tages (Schritte,
Herzfrequenz, Schlaf, Body Battery, Stress, Gewicht...), Ihre Garmin-Geräte
(Uhren, Radcomputer, Index-Waagen...), Ihre Aktivitäten, Szenenauslöser und
-aktionen sowie drei Dashboard-Widgets.

> Garmin bietet Privatpersonen keine öffentliche API. Die Integration meldet
> sich wie die Garmin Connect-App an und **liest** Ihre Daten nur. Garmin kann
> diese Anmeldung jederzeit ändern: Funktioniert sie nicht mehr, aktualisieren
> Sie die Integration.

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Geben Sie **E-Mail-Adresse** und **Passwort** Ihres Garmin Connect-Kontos
   ein.
3. Optionale Einstellungen:
   - **Garmin-Region**: `garmin.cn` nur für in China erstellte Konten;
   - **Zeitzone** Ihres Kontos (z. B. `Europe/Berlin`), um zu wissen, welcher
     Tag „heute“ ist;
   - **Synchronisierungsintervall**: standardmäßig 15 Minuten, mindestens
     5 Minuten (Garmin begrenzt seine API);
   - **Schwelle für niedrige Body Battery** des Szenenauslösers
     (standardmäßig 20);
   - **Sprache der Gerätenamen**, die in Gladys erstellt werden.
4. Speichern. Ohne Zwei-Faktor-Verifizierung meldet sich die Integration
   sofort an.

### Zwei-Faktor-Verifizierung (MFA)

Wenn Ihr Konto einen Code verlangt:

1. Beim Speichern sendet Garmin Ihnen einen Code (E-Mail, SMS oder
   Authentifizierungs-App), und der Verbindungsstatus fragt danach. Kein Code
   erhalten? Führen Sie die Aktion **Anmelden** ohne Code aus, um einen neuen
   zu erhalten.
2. Führen Sie **Anmelden** mit diesem Code aus.

Die Sitzung wird dann im Volume der Integration gespeichert und selbstständig
erneuert: Der Code wird nicht erneut verlangt, auch nicht nach einem Neustart.

### Geräte

Öffnen Sie den Reiter **Erkennung** und fügen Sie hinzu:

- **Garmin Connect - <Ihr Name>**: die Werte des Tages. Sie gehören zum Konto
  (Garmin führt alle Ihre Uhren zusammen), daher bleibt der Verlauf bei einem
  Uhrenwechsel erhalten;
- ein Gerät pro Garmin-Produkt Ihres Kontos, mit der Anzeige **zuletzt
  synchronisiertes Gerät** und der **Zeit seit der letzten Synchronisierung**
  (bekannt für das zuletzt synchronisierte Gerät).

Ein Wert, den Ihre Geräte nicht messen (keine Waage → kein Gewicht), bleibt
einfach leer.

## Aktionen

- **Anmelden** — meldet sich an (und schließt die Zwei-Faktor-Verifizierung
  ab).
- **Verbindung testen** — liest Garmin Connect und zeigt Ihre Schritte des
  Tages.
- **Jetzt synchronisieren** — liest Garmin Connect, ohne auf das Intervall zu
  warten.
- **Abmelden** — löscht die Garmin-Sitzung aus Gladys.

## Szenen

In der Kategorie **Integrationen** des Szeneneditors (Gladys 5.1 oder neuer):

Auslöser:

- **Garmin-Aktivität beendet** — optional nach Typ gefiltert (Laufen,
  Radfahren, Gehen, Wandern, Schwimmen, Krafttraining, Andere). Variablen:
  `activity_type`, `activity_name`, `distance_km`, `duration_minutes`,
  `calories`, `average_hr` (z. B. `{{triggerEvent.data.activity_name}}`).
- **Tägliches Schrittziel erreicht** — einmal täglich (`steps`, `step_goal`).
- **Body Battery niedrig** — wenn sie unter die konfigurierte Schwelle fällt
  (`body_battery`, `threshold`).
- **Schlafnacht aufgezeichnet** — wenn die letzte Nacht in Garmin Connect
  ankommt, meist bei der Synchronisierung am Morgen (`sleep_hours`,
  `sleep_score`).
- **Neue Wiegung** (`weight_kg`, `body_fat`, `bmi`).
- **Garmin-Gerät synchronisiert** — optional für ein bestimmtes Gerät
  (`device_name`).

Aktionen:

- **Garmin Connect synchronisieren** — Ausgaben `synced`, `steps`,
  `body_battery`.
- **Garmin-Tageszusammenfassung lesen** — die Werte des Tages als Ausgaben
  (Schritte, Schlaf, Ruheherzfrequenz, Body Battery, Stress, HFV, Gewicht...).
- **Letzte Garmin-Aktivität lesen** — `found`, `name`, `type`,
  `distance_km`...

Beispiel: „Wenn eine Schlafnacht aufgezeichnet wurde und der Schlafwert unter
60 liegt, schicke mir eine Nachricht mit der Schlafdauer“.

Die Werte selbst sind Gerätefunktionen: Der Standardauslöser „Gerätezustand“
funktioniert ebenfalls (z. B. „Body Battery über 80“).

## Dashboard

- **Garmin-Tageszusammenfassung** — Schritte, Body Battery, Ruheherzfrequenz,
  Schlafwert, Stress und Distanz live, dazu Konto, Schrittziel, letzte
  Synchronisierung und letzte Aktivität sowie eine Schaltfläche **Jetzt
  synchronisieren**.
- **Garmin-Aktivitäten** — Ihre 3, 5 oder 8 letzten Aktivitäten; jede öffnet
  ihre Details und einen Link zu Garmin Connect.
- **Garmin-Gesundheitstrend** — der Verlauf eines Messwerts (Schritte,
  Herzfrequenz, Body Battery, Stress, Schlaf, HFV, Gewicht) über 7 Tage bis
  ein Jahr.

## Fehlerbehebung

- **„Garmin hat die Anmeldung abgelehnt“**: Prüfen Sie E-Mail-Adresse und
  Passwort (testen Sie sie auf connect.garmin.com), speichern Sie und führen
  Sie **Anmelden** aus.
- **„Garmin blockiert vorübergehend Anmeldungen“**: Garmin begrenzt
  Anmeldungen pro Netzwerk. Die Integration wartet eine Stunde, bevor sie es
  selbst erneut versucht; Sie können es mit **Anmelden** erneut versuchen.
- **Kein Wert für eine Funktion**: Garmin hatte heute keine Daten dafür (keine
  Wiegung, kein HFV-Sensor an Ihrer Uhr...).
- Prüfen Sie die Logs der Integration in der Gladys-Oberfläche, mit
  `LOG_LEVEL=debug` für alle Details. Die Logs enthalten nie Ihr Passwort oder
  Ihre Sitzung.
