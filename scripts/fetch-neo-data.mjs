import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(__dirname, "../data/neo-0p5km.json");

const API = "https://ssd-api.jpl.nasa.gov/sbdb_query.api";
const H_ONE_KM = 17.75;
const DIAMETER_CUTOFF_KM = 0.5;
const H_CUTOFF = Number((H_ONE_KM + 5 * Math.log10(1 / DIAMETER_CUTOFF_KM)).toFixed(3));
const DEFAULT_NEA_ALBEDO = 0.14;
const fields = [
  "spkid",
  "full_name",
  "pdes",
  "name",
  "kind",
  "class",
  "neo",
  "pha",
  "H",
  "diameter",
  "diameter_sigma",
  "albedo",
  "moid",
  "orbit_id",
  "epoch",
  "e",
  "a",
  "q",
  "i",
  "om",
  "w",
  "ma",
  "per",
  "n",
  "ad",
  "condition_code",
  "data_arc",
  "n_obs_used",
  "source",
  "soln_date",
  "first_obs",
  "last_obs"
];

const numericFields = new Set([
  "H",
  "diameter",
  "diameter_sigma",
  "albedo",
  "moid",
  "epoch",
  "e",
  "a",
  "q",
  "i",
  "om",
  "w",
  "ma",
  "per",
  "n",
  "ad",
  "data_arc",
  "n_obs_used"
]);

const asteroidCriteria = {
  AND: [
    {
      OR: [
        `diameter|GE|${DIAMETER_CUTOFF_KM}`,
        {
          AND: ["diameter|ND", `H|LE|${H_CUTOFF}`]
        }
      ]
    }
  ]
};

const cometCriteria = {
  AND: [`diameter|GE|${DIAMETER_CUTOFF_KM}`]
};

function buildUrl(kind, criteria) {
  const url = new URL(API);
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("sb-kind", kind);
  url.searchParams.set("sb-group", "neo");
  url.searchParams.set("sb-cdata", JSON.stringify(criteria));
  url.searchParams.set("sort", "class,a");
  url.searchParams.set("full-prec", "true");
  return url;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function estimateDiameterKm(H, albedo = DEFAULT_NEA_ALBEDO) {
  if (!Number.isFinite(H) || !Number.isFinite(albedo) || albedo <= 0) {
    return null;
  }
  return (1329 / Math.sqrt(albedo)) * 10 ** (-H / 5);
}

function unpackRows(response, queryKind) {
  const fieldOrder = response.fields;
  return response.data.map((row) => {
    const object = {};
    for (let index = 0; index < fieldOrder.length; index += 1) {
      const key = fieldOrder[index];
      object[key] = numericFields.has(key) ? toNumber(row[index]) : row[index];
    }

    const measuredDiameter = object.diameter;
    const estimatedDiameter = estimateDiameterKm(object.H, DEFAULT_NEA_ALBEDO);
    const diameterKm = measuredDiameter ?? estimatedDiameter;
    const diameterSource = measuredDiameter ? "measured" : "estimated-from-H";

    return {
      ...object,
      query_kind: queryKind,
      display_name: (object.full_name || object.pdes || object.name || object.spkid || "").trim(),
      diameter_km: diameterKm,
      diameter_source: diameterSource,
      estimated_diameter_km: estimatedDiameter,
      is_comet: String(object.kind || "").startsWith("c")
    };
  });
}

async function fetchQuery(kind, criteria) {
  const url = buildUrl(kind, criteria);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SBDB request failed ${response.status}: ${await response.text()}`);
  }
  const json = await response.json();
  if (!Array.isArray(json.data)) {
    throw new Error(`SBDB response did not include data rows: ${JSON.stringify(json)}`);
  }
  return {
    url: url.toString(),
    rows: unpackRows(json, kind),
    count: Number(json.count),
    signature: json.signature
  };
}

function hasDrawableOrbit(object) {
  return (
    Number.isFinite(object.a) &&
    Number.isFinite(object.e) &&
    object.e >= 0 &&
    object.e < 1 &&
    Number.isFinite(object.epoch) &&
    Number.isFinite(object.ma) &&
    Number.isFinite(object.n) &&
    object.n > 0
  );
}

const asteroidResult = await fetchQuery("a", asteroidCriteria);
const cometResult = await fetchQuery("c", cometCriteria);
const combined = [...asteroidResult.rows, ...cometResult.rows];
const drawable = combined.filter(hasDrawableOrbit);
const skipped = combined.filter((object) => !hasDrawableOrbit(object));

drawable.sort((a, b) => {
  const diameterDelta = (b.diameter_km ?? 0) - (a.diameter_km ?? 0);
  if (diameterDelta !== 0) return diameterDelta;
  return a.display_name.localeCompare(b.display_name);
});

const payload = {
  generated_at: new Date().toISOString(),
  source: {
    name: "NASA/JPL SBDB Query API",
    docs: "https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html",
    filter_docs: "https://ssd-api.jpl.nasa.gov/doc/sbdb_filter.html",
    cneos_stats: "https://cneos.jpl.nasa.gov/stats/",
    asteroid_query: asteroidResult.url,
    comet_query: cometResult.url
  },
  criteria: {
    asteroid: `Near-Earth asteroids with diameter >= ${DIAMETER_CUTOFF_KM} km, plus asteroids with no listed diameter and H <= ${H_CUTOFF}.`,
    comet: `Near-Earth comets with diameter >= ${DIAMETER_CUTOFF_KM} km.`,
    diameter_cutoff_km: DIAMETER_CUTOFF_KM,
    h_one_km: H_ONE_KM,
    h_cutoff: H_CUTOFF,
    default_nea_albedo: DEFAULT_NEA_ALBEDO,
    orbit_note: "Client visualization uses heliocentric osculating two-body elements, translated into an Earth-centered frame for display."
  },
  stats: {
    asteroid_query_count: asteroidResult.count,
    comet_query_count: cometResult.count,
    drawable_count: drawable.length,
    skipped_count: skipped.length,
    pha_count: drawable.filter((object) => object.pha === "Y").length,
    measured_diameter_count: drawable.filter((object) => object.diameter_source === "measured").length,
    estimated_diameter_count: drawable.filter((object) => object.diameter_source !== "measured").length
  },
  skipped,
  objects: drawable
};

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`Wrote ${drawable.length} drawable NEOs >= ${DIAMETER_CUTOFF_KM} km to ${outFile}`);
if (skipped.length > 0) {
  console.log(`Skipped ${skipped.length} objects without drawable elliptical elements.`);
}
