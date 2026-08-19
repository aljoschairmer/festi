/**
 * Static reference data for rider profiles. Bike brands with their common
 * models power the brand/model selects; users can always enter a custom value
 * via the "Other" option, so this list only needs to cover the popular cases.
 */

export const BIKE_BRANDS: Record<string, string[]> = {
  Trek: ["Domane", "Émonda", "Madone", "Checkpoint", "Marlin", "Fuel EX"],
  Specialized: ["Tarmac", "Roubaix", "Allez", "Diverge", "Stumpjumper", "Epic"],
  Giant: ["TCR", "Defy", "Propel", "Revolt", "Trance", "Talon"],
  Cannondale: ["SuperSix Evo", "Synapse", "CAAD13", "Topstone", "Scalpel"],
  Canyon: ["Ultimate", "Endurace", "Aeroad", "Grail", "Spectral", "Neuron"],
  Cube: ["Attain", "Agree", "Nuroad", "Reaction", "Stereo"],
  Scott: ["Addict", "Foil", "Speedster", "Spark", "Scale"],
  Bianchi: ["Oltre", "Sprint", "Infinito", "Impulso", "Arcadex"],
  Merida: ["Reacto", "Scultura", "Silex", "Big.Nine", "One-Forty"],
  BMC: ["Teammachine", "Roadmachine", "Timemachine", "URS", "Fourstroke"],
  Cervélo: ["S5", "R5", "Caledonia", "Áspero", "Soloist"],
  Pinarello: ["Dogma F", "Prince", "Paris", "Grevil"],
  Orbea: ["Orca", "Avant", "Terra", "Oiz", "Rise"],
  Focus: ["Izalco", "Paralane", "Atlas", "Jam", "Raven"],
  Ghost: ["Nirvana", "Lector", "Kato", "Riot"],
  "Santa Cruz": ["Tallboy", "Hightower", "Bronson", "Megatower", "Stigmata"],
  "Rose Bikes": ["Backroad", "Reveal", "Xeon", "Root Miller"],
  "Van Rysel": [
    "NCR CF",
    "RCR",
    "RCR Pro",
    "EDR CF",
    "EDR AF",
    "FCR",
    "GCR",
    "Triban RC",
  ],
};

export const OTHER_OPTION = "__other__";

/** Flat, searchable list of "Brand Model" strings for the bike combobox. */
export const ALL_BIKES: string[] = Object.entries(BIKE_BRANDS)
  .flatMap(([brand, models]) =>
    models.length > 0 ? models.map((model) => `${brand} ${model}`) : [brand],
  )
  .sort((a, b) => a.localeCompare(b));

/** Splits a chosen bike string back into brand + model columns. */
export function splitBike(value: string | null | undefined): {
  brand: string | null;
  model: string | null;
} {
  const bike = value?.trim();
  if (!bike) return { brand: null, model: null };

  for (const [brand, models] of Object.entries(BIKE_BRANDS)) {
    if (bike === brand) return { brand, model: null };
    for (const model of models) {
      if (bike === `${brand} ${model}`) return { brand, model };
    }
  }

  return { brand: null, model: bike };
}

/** Joins stored brand + model into a single display/combobox value. */
export function formatBike(
  brand: string | null | undefined,
  model: string | null | undefined,
): string {
  return [brand, model].filter(Boolean).join(" ");
}

export const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert / Pro" },
] as const;

export const RIDING_STYLES = [
  { value: "road", label: "Road" },
  { value: "gravel", label: "Gravel" },
  { value: "mountain", label: "Mountain" },
  { value: "commuting", label: "Commuting" },
  { value: "touring", label: "Touring / Bikepacking" },
  { value: "cyclocross", label: "Cyclocross" },
  { value: "track", label: "Track" },
  { value: "ebike", label: "E-bike" },
  { value: "bmx", label: "BMX" },
] as const;

export function skillLevelLabel(
  value: string | null | undefined,
): string | null {
  return SKILL_LEVELS.find((s) => s.value === value)?.label ?? value ?? null;
}

export function ridingStyleLabel(value: string): string {
  return RIDING_STYLES.find((s) => s.value === value)?.label ?? value;
}
