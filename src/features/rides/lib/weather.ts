/** Presentation helpers for the engine's ride-time weather data. */

/**
 * Emoji for a WMO weather interpretation code (the scheme Open-Meteo
 * uses): 0 clear … 3 overcast, 45+ fog, 50s drizzle, 60s rain,
 * 70s snow, 80s showers, 95+ thunderstorm.
 */
export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code === 85 || code === 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

/** Compass label ("N", "NE", …) for a direction in degrees. */
export function compassLabel(deg: number): string {
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
