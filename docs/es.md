# Garmin Connect

Su cuenta Garmin en Gladys: los valores de salud del día (pasos, frecuencia
cardíaca, sueño, Body Battery, estrés, peso...), sus dispositivos Garmin
(relojes, ciclocomputadores, básculas Index...), sus actividades,
disparadores y acciones de escena, y tres widgets para el panel.

> Garmin no ofrece API pública a particulares. La integración inicia sesión
> como la aplicación Garmin Connect y solo **lee** sus datos. Garmin puede
> cambiar este inicio de sesión en cualquier momento: si deja de funcionar,
> actualice la integración.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **correo electrónico** y la **contraseña** de su cuenta
   Garmin Connect.
3. Ajustes opcionales:
   - **Región de Garmin**: `garmin.cn` solo para cuentas creadas en China;
   - **Zona horaria** de su cuenta (p. ej. `Europe/Madrid`), para saber qué
     día es «hoy»;
   - **Intervalo de sincronización**: 15 minutos por defecto, 5 minutos como
     mínimo (Garmin limita su API);
   - **Umbral de Body Battery baja** del disparador de escena (20 por
     defecto);
   - **Idioma de los nombres de dispositivos** creados en Gladys.
4. Guarde. Sin verificación en dos pasos, la integración inicia sesión
   inmediatamente.

### Verificación en dos pasos (MFA)

Si su cuenta pide un código:

1. Al guardar, Garmin le envía un código (correo, SMS o aplicación de
   autenticación) y el estado de la conexión lo pide. ¿No ha recibido el
   código? Ejecute la acción **Iniciar sesión** sin código para obtener uno
   nuevo.
2. Ejecute **Iniciar sesión** con ese código.

La sesión se guarda después en el volumen de la integración y se renueva sola:
el código no se vuelve a pedir, ni siquiera tras un reinicio.

### Dispositivos

Abra la pestaña **Descubrimiento** y añada:

- **Garmin Connect - <su nombre>**: los valores del día. Pertenecen a la
  cuenta (Garmin combina todos sus relojes), por lo que el historial se
  conserva al cambiar de reloj;
- un dispositivo por cada producto Garmin de su cuenta, con el indicador
  **último dispositivo sincronizado** y el **tiempo desde su última
  sincronización** (conocido para el dispositivo que sincronizó el último).

Un valor que sus dispositivos no miden (sin báscula → sin peso) simplemente
queda vacío.

## Acciones

- **Iniciar sesión** — inicia sesión (y completa la verificación en dos
  pasos).
- **Probar la conexión** — lee Garmin Connect y muestra sus pasos del día.
- **Sincronizar ahora** — lee Garmin Connect sin esperar al intervalo.
- **Cerrar sesión** — elimina la sesión de Garmin de Gladys.

## Escenas

En la categoría **Integraciones** del editor de escenas (Gladys 5.1 o
posterior):

Disparadores:

- **Actividad Garmin completada** — filtrable por tipo (carrera, ciclismo,
  caminata, senderismo, natación, entrenamiento de fuerza, otra). Variables:
  `activity_type`, `activity_name`, `distance_km`, `duration_minutes`,
  `calories`, `average_hr` (p. ej. `{{triggerEvent.data.activity_name}}`).
- **Objetivo diario de pasos alcanzado** — una vez al día (`steps`,
  `step_goal`).
- **Body Battery baja** — cuando baja del umbral configurado (`body_battery`,
  `threshold`).
- **Noche de sueño registrada** — cuando la noche llega a Garmin Connect,
  normalmente al sincronizar por la mañana (`sleep_hours`, `sleep_score`).
- **Nuevo pesaje** (`weight_kg`, `body_fat`, `bmi`).
- **Dispositivo Garmin sincronizado** — opcionalmente para un dispositivo
  concreto (`device_name`).

Acciones:

- **Sincronizar Garmin Connect** — salidas `synced`, `steps`,
  `body_battery`.
- **Leer el resumen diario de Garmin** — los valores del día como salidas
  (pasos, sueño, frecuencia cardíaca en reposo, Body Battery, estrés, VFC,
  peso...).
- **Leer la última actividad de Garmin** — `found`, `name`, `type`,
  `distance_km`...

Ejemplo: «Cuando se registre una noche de sueño y la puntuación sea inferior
a 60, envíame un mensaje con la duración del sueño».

Los propios valores son funciones de dispositivo: el disparador estándar
«estado de un dispositivo» también funciona (p. ej. «Body Battery superior a
80»).

## Panel

- **Resumen diario de Garmin** — pasos, Body Battery, frecuencia cardíaca en
  reposo, puntuación del sueño, estrés y distancia en directo, además de la
  cuenta, el objetivo de pasos, la última sincronización y la última
  actividad, y un botón **Sincronizar**.
- **Actividades Garmin** — sus 3, 5 u 8 últimas actividades; cada una abre su
  detalle y un enlace a Garmin Connect.
- **Tendencia de salud Garmin** — el historial de una medida (pasos,
  frecuencia cardíaca, Body Battery, estrés, sueño, VFC, peso) de 7 días a un
  año.

## Solución de problemas

- **«Garmin rechazó el inicio de sesión»**: compruebe el correo y la
  contraseña (pruébelos en connect.garmin.com), guarde y ejecute **Iniciar
  sesión**.
- **«Garmin bloquea temporalmente los inicios de sesión»**: Garmin limita los
  inicios de sesión por red. La integración espera una hora antes de volver a
  intentarlo sola; puede reintentarlo con **Iniciar sesión**.
- **Sin valor para una función**: Garmin no tenía datos hoy (sin pesaje, sin
  sensor de VFC en su reloj...).
- Consulte los registros de la integración desde la interfaz de Gladys, con
  `LOG_LEVEL=debug` para el detalle completo. Los registros nunca contienen su
  contraseña ni su sesión.
