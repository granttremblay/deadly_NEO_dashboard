const AU_KM = 149_597_870.7;
const LD_AU = 384_400 / AU_KM;
const MS_PER_DAY = 86_400_000;
const J2000 = 2451545.0;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const CLASS_LABELS = {
  IEO: "Atira",
  ATE: "Aten",
  APO: "Apollo",
  AMO: "Amor",
  COM: "Comet"
};
const CLASS_COLORS = {
  IEO: "#ff5a5f",
  ATE: "#ffd166",
  APO: "#06d6a0",
  AMO: "#4cc9f0",
  COM: "#f6f7eb",
  AST: "#b8f28b"
};
const TRAIL_DAYS = 90;
const TRAIL_STEPS = 12;
const SELECTED_TRAIL_DAYS = 180;
const SELECTED_TRAIL_STEPS = 24;

const elements = {
  canvas: document.querySelector("#orbitCanvas"),
  loading: document.querySelector("#loading"),
  totalCount: document.querySelector("#totalCount"),
  phaCount: document.querySelector("#phaCount"),
  dateReadout: document.querySelector("#dateReadout"),
  dateInput: document.querySelector("#dateInput"),
  playToggle: document.querySelector("#playToggle"),
  todayButton: document.querySelector("#todayButton"),
  speedRange: document.querySelector("#speedRange"),
  speedOutput: document.querySelector("#speedOutput"),
  diameterRange: document.querySelector("#diameterRange"),
  diameterOutput: document.querySelector("#diameterOutput"),
  classSelect: document.querySelector("#classSelect"),
  kindSelect: document.querySelector("#kindSelect"),
  displayAll: document.querySelector("#displayAll"),
  labelsToggle: document.querySelector("#labelsToggle"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  selectedName: document.querySelector("#selectedName"),
  selectedDetails: document.querySelector("#selectedDetails"),
  objectList: document.querySelector("#objectList"),
  listCount: document.querySelector("#listCount"),
  sourceDate: document.querySelector("#sourceDate")
};

const ctx = elements.canvas.getContext("2d", { alpha: false });
const state = {
  data: null,
  objects: [],
  filtered: [],
  selectedId: null,
  jd: dateToJulianDay(new Date()),
  playing: true,
  speedDaysPerSecond: 30,
  minDiameter: 0.5,
  classFilter: "all",
  kindFilter: "all",
  displayAll: false,
  showLabels: false,
  search: "",
  sort: "diameter",
  yaw: -0.68,
  pitch: 0.58,
  zoom: 118,
  dpr: 1,
  width: 0,
  height: 0,
  lastFrameTime: null,
  lastHudTime: 0,
  drag: null,
  pointer: { x: 0, y: 0 },
  projected: []
};

function dateToJulianDay(date) {
  return date.getTime() / MS_PER_DAY + 2440587.5;
}

function julianDayToDate(jd) {
  return new Date((jd - 2440587.5) * MS_PER_DAY);
}

function formatDate(jd) {
  return julianDayToDate(jd).toISOString().slice(0, 10);
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

function formatCompact(value, digits = 1) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits
  }).format(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngleDegrees(value) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function solveKepler(meanAnomalyRadians, eccentricity) {
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomalyRadians : Math.PI;
  for (let step = 0; step < 12; step += 1) {
    const delta =
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomalyRadians) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-9) break;
  }
  return eccentricAnomaly;
}

function rotateEcliptic(xOrbital, yOrbital, object) {
  const cosW = Math.cos((object.w ?? 0) * RAD);
  const sinW = Math.sin((object.w ?? 0) * RAD);
  const cosI = Math.cos((object.i ?? 0) * RAD);
  const sinI = Math.sin((object.i ?? 0) * RAD);
  const cosNode = Math.cos((object.om ?? 0) * RAD);
  const sinNode = Math.sin((object.om ?? 0) * RAD);

  const x1 = cosW * xOrbital - sinW * yOrbital;
  const y1 = sinW * xOrbital + cosW * yOrbital;
  const z1 = 0;
  const x2 = x1;
  const y2 = cosI * y1 - sinI * z1;
  const z2 = sinI * y1 + cosI * z1;

  return {
    x: cosNode * x2 - sinNode * y2,
    y: sinNode * x2 + cosNode * y2,
    z: z2
  };
}

function positionFromElements(object, jd = state.jd) {
  const meanAnomaly = normalizeAngleDegrees(object.ma + object.n * (jd - object.epoch)) * RAD;
  const eccentricAnomaly = solveKepler(meanAnomaly, object.e);
  const xOrbital = object.a * (Math.cos(eccentricAnomaly) - object.e);
  const yOrbital = object.a * Math.sqrt(1 - object.e * object.e) * Math.sin(eccentricAnomaly);
  return rotateEcliptic(xOrbital, yOrbital, object);
}

function earthPosition(jd) {
  const T = (jd - J2000) / 36525;
  const a = 1.00000261 + 0.00000562 * T;
  const e = 0.01671123 - 0.00004392 * T;
  const i = -0.00001531 - 0.01294668 * T;
  const meanLongitude = 100.46457166 + 35999.37244981 * T;
  const longitudePerihelion = 102.93768193 + 0.32327364 * T;
  const om = 0;
  const w = longitudePerihelion - om;
  const ma = normalizeAngleDegrees(meanLongitude - longitudePerihelion);

  return positionFromElements(
    {
      a,
      e,
      i,
      om,
      w,
      ma,
      n: 0.98564736,
      epoch: jd
    },
    jd
  );
}

function distance(a, b = { x: 0, y: 0, z: 0 }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function geocentricPosition(object, jd, earth = earthPosition(jd)) {
  const heliocentric = positionFromElements(object, jd);
  return {
    x: heliocentric.x - earth.x,
    y: heliocentric.y - earth.y,
    z: heliocentric.z - earth.z
  };
}

function project(point) {
  const cy = Math.cos(state.yaw);
  const sy = Math.sin(state.yaw);
  const cp = Math.cos(state.pitch);
  const sp = Math.sin(state.pitch);
  const x1 = point.x * cy - point.y * sy;
  const y1 = point.x * sy + point.y * cy;
  const z1 = point.z;
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;
  return {
    x: state.width * 0.5 + x1 * state.zoom,
    y: state.height * 0.52 + y2 * state.zoom,
    z: z2
  };
}

function isOnCanvas(screen, margin = 40) {
  return (
    screen.x >= -margin &&
    screen.x <= state.width + margin &&
    screen.y >= -margin &&
    screen.y <= state.height + margin
  );
}

function renderStateForObject(object, earth) {
  const geocentric = geocentricPosition(object, state.jd, earth);
  const screen = project(geocentric);
  return {
    object,
    geocentric,
    screen,
    rangeAu: distance(geocentric),
    visible: isOnCanvas(screen)
  };
}

function objectClass(object) {
  if (object.is_comet) return "COM";
  return object.class || "AST";
}

function objectColor(object) {
  return CLASS_COLORS[objectClass(object)] || CLASS_COLORS.AST;
}

function rgbaColor(hex, alpha) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function objectType(object) {
  return object.is_comet ? "comet" : "asteroid";
}

function resizeCanvas() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  elements.canvas.width = Math.floor(state.width * state.dpr);
  elements.canvas.height = Math.floor(state.height * state.dpr);
  elements.canvas.style.width = `${state.width}px`;
  elements.canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

function drawBackground() {
  ctx.fillStyle = "#050711";
  ctx.fillRect(0, 0, state.width, state.height);
}

function drawGrid() {
  const radii = [0.25, 0.5, 1, 2, 3, 5];
  ctx.save();
  ctx.lineWidth = 1;
  for (const radius of radii) {
    ctx.strokeStyle = radius === 1 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.11)";
    ctx.beginPath();
    const steps = 220;
    for (let index = 0; index <= steps; index += 1) {
      const angle = (index / steps) * Math.PI * 2;
      const point = project({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 });
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = "12px system-ui, sans-serif";
  const label = project({ x: 1, y: 0, z: 0 });
  ctx.fillText("1 AU", label.x + 8, label.y - 8);
  ctx.restore();
}

function drawSunAndEarth(earth) {
  const sun = project({ x: -earth.x, y: -earth.y, z: -earth.z });
  const sunRadius = clamp(10 + state.zoom * 0.012, 10, 17);
  const glow = ctx.createRadialGradient(sun.x, sun.y, 1, sun.x, sun.y, sunRadius * 4);
  glow.addColorStop(0, "rgba(255, 224, 130, 0.9)");
  glow.addColorStop(0.3, "rgba(255, 209, 102, 0.28)");
  glow.addColorStop(1, "rgba(255, 209, 102, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, sunRadius * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  const earthRadius = clamp(8 + state.zoom * 0.018, 9, 18);
  const earthX = state.width * 0.5;
  const earthY = state.height * 0.52;
  const earthGradient = ctx.createRadialGradient(
    earthX - earthRadius * 0.3,
    earthY - earthRadius * 0.35,
    1,
    earthX,
    earthY,
    earthRadius
  );
  earthGradient.addColorStop(0, "#d9fff2");
  earthGradient.addColorStop(0.35, "#4cc9f0");
  earthGradient.addColorStop(0.68, "#0f9f7a");
  earthGradient.addColorStop(1, "#0a2d35");
  ctx.fillStyle = earthGradient;
  ctx.beginPath();
  ctx.arc(earthX, earthY, earthRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "rgba(76, 201, 240, 0.25)";
  ctx.beginPath();
  ctx.arc(earthX, earthY, Math.max(earthRadius + 7, state.zoom * LD_AU * 10), 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Earth", earthX + earthRadius + 7, earthY + 4);
  ctx.fillText("Sun", sun.x + sunRadius + 7, sun.y + 4);
}

function drawTrail(object, isSelected) {
  const steps = isSelected ? SELECTED_TRAIL_STEPS : TRAIL_STEPS;
  const trailDays = isSelected ? SELECTED_TRAIL_DAYS : TRAIL_DAYS;
  const color = objectColor(object);
  let previous = null;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const jd = state.jd - trailDays * (1 - progress);
    const point = project(geocentricPosition(object, jd));

    if (previous) {
      const alpha = isSelected ? 0.14 + progress * 0.54 : 0.02 + progress * 0.11;
      ctx.strokeStyle = rgbaColor(color, alpha);
      ctx.lineWidth = isSelected ? 1.3 + progress * 1.4 : 0.45 + progress * 0.45;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }

    previous = point;
  }

  ctx.restore();
}

function drawObject(renderable, isSelected) {
  if (!renderable.visible) return null;

  const { object, screen, rangeAu } = renderable;
  const diameter = object.diameter_km ?? 1;
  const radius = isSelected
    ? clamp(5 + Math.log10(diameter + 1) * 4, 6, 13)
    : clamp(2 + Math.log10(diameter + 1) * 2.1, 2.4, 7);

  const color = objectColor(object);
  ctx.globalAlpha = isSelected ? 1 : clamp(0.36 + 0.22 / Math.max(rangeAu, 0.3), 0.36, 0.78);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (isSelected) {
    ctx.strokeStyle = "rgba(255,255,255,0.88)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.showLabels || isSelected) {
    ctx.fillStyle = "rgba(245,247,239,0.88)";
    ctx.font = isSelected ? "600 13px system-ui, sans-serif" : "11px system-ui, sans-serif";
    ctx.fillText(object.display_name, screen.x + radius + 5, screen.y - radius - 3);
  }

  return { object, screen, rangeAu };
}

function drawScene() {
  drawBackground();
  drawGrid();
  const earth = earthPosition(state.jd);
  state.projected = [];
  const renderables = state.filtered.map((object) => renderStateForObject(object, earth));
  const selected = renderables.find(({ object }) => object.spkid === state.selectedId);

  for (const renderable of renderables) {
    if (renderable.object.spkid !== state.selectedId && renderable.visible) {
      drawTrail(renderable.object, false);
    }
  }
  if (selected) drawTrail(selected.object, true);

  const sortedForDepth = [...renderables].sort((a, b) => a.screen.z - b.screen.z);

  for (const renderable of sortedForDepth) {
    const projected = drawObject(renderable, renderable.object.spkid === state.selectedId);
    if (projected) state.projected.push(projected);
  }

  drawSunAndEarth(earth);
}

function applyFilters() {
  const search = state.search.trim().toLowerCase();
  state.filtered = state.objects.filter((object) => {
    if ((object.diameter_km ?? 0) < state.minDiameter) return false;
    if (!state.displayAll && object.pha !== "Y") return false;
    if (state.kindFilter !== "all" && objectType(object) !== state.kindFilter) return false;
    if (state.classFilter !== "all" && objectClass(object) !== state.classFilter) return false;
    if (search) {
      const haystack = `${object.display_name} ${object.pdes ?? ""} ${object.name ?? ""} ${object.spkid ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  sortFiltered();
  if (state.filtered.length > 0 && !state.filtered.some((object) => object.spkid === state.selectedId)) {
    state.selectedId = state.filtered[0].spkid;
  }
  renderList();
  updateHud(true);
}

function sortFiltered() {
  const comparators = {
    diameter: (a, b) => (b.diameter_km ?? 0) - (a.diameter_km ?? 0),
    moid: (a, b) => (a.moid ?? Infinity) - (b.moid ?? Infinity),
    name: (a, b) => a.display_name.localeCompare(b.display_name),
    class: (a, b) => objectClass(a).localeCompare(objectClass(b)) || a.display_name.localeCompare(b.display_name)
  };
  state.filtered.sort(comparators[state.sort] ?? comparators.diameter);
}

function renderList() {
  elements.objectList.textContent = "";
  const fragment = document.createDocumentFragment();
  const listItems = state.filtered.slice(0, 120);

  for (const object of listItems) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-row";
    button.dataset.id = object.spkid;
    button.setAttribute("role", "listitem");
    if (object.spkid === state.selectedId) button.classList.add("active");
    button.innerHTML = `
      <span class="row-main">
        <i style="background:${objectColor(object)}"></i>
        <strong>${escapeHtml(object.display_name)}</strong>
      </span>
      <span>${formatCompact(object.diameter_km, 2)} km</span>
      <span>${CLASS_LABELS[objectClass(object)] ?? objectClass(object)}</span>
    `;
    button.addEventListener("click", () => selectObject(object.spkid));
    fragment.append(button);
  }

  elements.objectList.append(fragment);
  elements.listCount.textContent =
    state.filtered.length > listItems.length
      ? `${state.filtered.length} objects, first ${listItems.length} listed`
      : `${state.filtered.length} objects`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function selectedObject() {
  return state.objects.find((object) => object.spkid === state.selectedId) ?? null;
}

function selectObject(id) {
  state.selectedId = id;
  renderList();
  updateSelectedDetails();
}

function updateHud(force = false) {
  const now = performance.now();
  if (!force && now - state.lastHudTime < 220) return;
  state.lastHudTime = now;

  elements.totalCount.textContent = formatCompact(state.filtered.length, 0);
  elements.phaCount.textContent = formatCompact(
    state.filtered.filter((object) => object.pha === "Y").length,
    0
  );
  elements.dateReadout.textContent = formatDate(state.jd);
  elements.dateInput.value = formatDate(state.jd);
  elements.speedOutput.textContent = `${state.speedDaysPerSecond} d/s`;
  elements.diameterOutput.textContent = `${formatCompact(state.minDiameter, 1)} km`;
  updateSelectedDetails();
}

function updateSelectedDetails() {
  const object = selectedObject();
  if (!object) {
    elements.selectedName.textContent = "None selected";
    elements.selectedDetails.innerHTML = detailMarkup();
    return;
  }

  const earth = earthPosition(state.jd);
  const rangeAu = distance(geocentricPosition(object, state.jd, earth));

  elements.selectedName.textContent = object.display_name;
  elements.selectedDetails.innerHTML = detailMarkup({
    diameter: `${formatCompact(object.diameter_km, 2)} km ${object.diameter_source === "measured" ? "" : "est."}`,
    className: `${CLASS_LABELS[objectClass(object)] ?? objectClass(object)}${object.pha === "Y" ? " / PHA" : ""}`,
    moid: object.moid ? `${formatCompact(object.moid, 4)} AU / ${formatCompact(object.moid / LD_AU, 1)} LD` : "--",
    range: `${formatCompact(rangeAu, 3)} AU`,
    orbit: `a ${formatCompact(object.a, 3)} AU / e ${formatCompact(object.e, 3)} / i ${formatCompact(object.i, 1)} deg`,
    observed: `${formatCompact(object.n_obs_used, 0)} obs / ${formatCompact(object.data_arc, 0)} d arc`
  });
}

function detailMarkup(values = {}) {
  const entries = [
    ["Diameter", values.diameter ?? "--"],
    ["Class", values.className ?? "--"],
    ["MOID", values.moid ?? "--"],
    ["Current range", values.range ?? "--"],
    ["Orbit", values.orbit ?? "--"],
    ["Observations", values.observed ?? "--"]
  ];
  return entries
    .map(
      ([term, description]) => `
        <div>
          <dt>${term}</dt>
          <dd>${description}</dd>
        </div>
      `
    )
    .join("");
}

function animate(frameTime) {
  if (state.lastFrameTime === null) state.lastFrameTime = frameTime;
  const deltaSeconds = Math.min((frameTime - state.lastFrameTime) / 1000, 0.08);
  state.lastFrameTime = frameTime;

  if (state.playing) {
    state.jd += deltaSeconds * state.speedDaysPerSecond;
  }

  drawScene();
  updateHud();
  requestAnimationFrame(animate);
}

function nearestProjectedObject(x, y) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const projected of state.projected) {
    const dx = projected.screen.x - x;
    const dy = projected.screen.y - y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    if (pixelDistance < nearestDistance) {
      nearest = projected.object;
      nearestDistance = pixelDistance;
    }
  }
  return nearestDistance < 18 ? nearest : null;
}

function setupControls() {
  window.addEventListener("resize", resizeCanvas);

  elements.playToggle.addEventListener("click", () => {
    state.playing = !state.playing;
    elements.playToggle.textContent = state.playing ? "Pause" : "Play";
  });

  elements.todayButton.addEventListener("click", () => {
    state.jd = dateToJulianDay(new Date());
    updateHud(true);
  });

  elements.dateInput.addEventListener("change", () => {
    if (!elements.dateInput.value) return;
    state.jd = dateToJulianDay(new Date(`${elements.dateInput.value}T00:00:00Z`));
    updateHud(true);
  });

  elements.speedRange.addEventListener("input", () => {
    state.speedDaysPerSecond = Number(elements.speedRange.value);
    updateHud(true);
  });

  elements.diameterRange.addEventListener("input", () => {
    state.minDiameter = Number(elements.diameterRange.value);
    applyFilters();
  });

  elements.classSelect.addEventListener("change", () => {
    state.classFilter = elements.classSelect.value;
    applyFilters();
  });

  elements.kindSelect.addEventListener("change", () => {
    state.kindFilter = elements.kindSelect.value;
    applyFilters();
  });

  elements.displayAll.addEventListener("change", () => {
    state.displayAll = elements.displayAll.checked;
    applyFilters();
  });

  elements.labelsToggle.addEventListener("change", () => {
    state.showLabels = elements.labelsToggle.checked;
  });

  elements.searchInput.addEventListener("input", () => {
    state.search = elements.searchInput.value;
    applyFilters();
  });

  elements.sortSelect.addEventListener("change", () => {
    state.sort = elements.sortSelect.value;
    sortFiltered();
    renderList();
  });

  elements.canvas.addEventListener("pointerdown", (event) => {
    elements.canvas.setPointerCapture(event.pointerId);
    state.drag = {
      x: event.clientX,
      y: event.clientY,
      yaw: state.yaw,
      pitch: state.pitch,
      moved: false
    };
  });

  elements.canvas.addEventListener("pointermove", (event) => {
    state.pointer = { x: event.clientX, y: event.clientY };
    if (!state.drag) {
      elements.canvas.style.cursor = nearestProjectedObject(event.clientX, event.clientY)
        ? "pointer"
        : "grab";
      return;
    }
    const dx = event.clientX - state.drag.x;
    const dy = event.clientY - state.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) state.drag.moved = true;
    state.yaw = state.drag.yaw + dx * 0.006;
    state.pitch = clamp(state.drag.pitch + dy * 0.004, -0.18, 1.28);
  });

  elements.canvas.addEventListener("pointerup", (event) => {
    const wasClick = state.drag && !state.drag.moved;
    state.drag = null;
    elements.canvas.releasePointerCapture(event.pointerId);
    if (wasClick) {
      const nearest = nearestProjectedObject(event.clientX, event.clientY);
      if (nearest) selectObject(nearest.spkid);
    }
  });

  elements.canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      state.zoom = clamp(state.zoom * (event.deltaY > 0 ? 0.92 : 1.09), 42, 390);
    },
    { passive: false }
  );
}

async function loadData() {
  const response = await fetch(new URL("../data/neo-0p5km.json", import.meta.url));
  if (!response.ok) {
    throw new Error(`Could not load data/neo-0p5km.json (${response.status})`);
  }
  const data = await response.json();
  state.data = data;
  state.objects = data.objects;
  state.selectedId = state.objects[0]?.spkid ?? null;
  elements.sourceDate.textContent = `data ${new Date(data.generated_at).toISOString().slice(0, 10)}`;
  applyFilters();
}

async function init() {
  resizeCanvas();
  setupControls();
  try {
    await loadData();
    elements.loading.hidden = true;
    requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    elements.loading.textContent =
      "Could not load the SBDB snapshot. Run `npm run fetch:data`, then serve this folder over HTTP.";
  }
}

init();
