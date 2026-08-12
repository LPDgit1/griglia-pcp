const VIEW_META = {
  dashboard: ["Panoramica analitica", "Dashboard"],
  grid: ["Editor della matrice", "Griglia"],
  correlations: ["Associazioni lineari", "Correlazioni"],
  dynamics: ["Repertory Grid Dynamics", "RG Dynamics"],
  factors: ["Struttura latente", "PCA e fattori"],
  clusters: ["Somiglianze e distanze", "Cluster"],
  data: ["Importazione ed esportazione", "Dati"],
};

const STORAGE_KEY = "griglia-pcp-v1";
const LEGACY_DEMO_NAMES = new Set(["Esempio: relazioni professionali", "Griglia demo"]);

const demoGrid = {
  name: "Griglia senza titolo",
  scale: { min: 1, max: 7 },
  elements: ["Io", "Io ideale", "Responsabile", "Collega A", "Collega B", "Amico", "Mentore"],
  constructs: [
    { left: "Accogliente", right: "Distante", values: [2, 1, 5, 2, 4, 1, 2] },
    { left: "Deciso", right: "Esitante", values: [4, 2, 1, 3, 5, 4, 2] },
    { left: "Flessibile", right: "Rigido", values: [3, 2, 6, 3, 5, 2, 3] },
    { left: "Affidabile", right: "Incostante", values: [2, 1, 3, 2, 6, 2, 1] },
    { left: "Creativo", right: "Convenzionale", values: [2, 1, 5, 3, 4, 1, 2] },
    { left: "Collaborativo", right: "Individualista", values: [2, 1, 5, 2, 6, 1, 2] },
    { left: "Pragmatico", right: "Astratto", values: [4, 3, 2, 4, 3, 5, 3] },
    { left: "Calmo", right: "Reattivo", values: [3, 2, 5, 3, 6, 2, 2] },
    { left: "Autonomo", right: "Dipendente", values: [3, 2, 2, 4, 5, 3, 2] },
  ],
};

let state = loadInitialState();
let activeView = "dashboard";
let toastTimer;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shorten(value, length = 17) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function safeNumber(value, fallback = 0) {
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function fmt(value, digits = 1) {
  return Number.isFinite(value)
    ? value.toLocaleString("it-IT", { maximumFractionDigits: digits, minimumFractionDigits: digits })
    : "—";
}

function fmtSmart(value, digits = 2) {
  return Number.isFinite(value)
    ? value.toLocaleString("it-IT", { maximumFractionDigits: digits })
    : "—";
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function variance(values, sample = false) {
  if (!values.length || (sample && values.length < 2)) return 0;
  const avg = mean(values);
  const divisor = sample ? values.length - 1 : values.length;
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / divisor;
}

function sd(values, sample = false) {
  return Math.sqrt(variance(values, sample));
}

function transpose(matrix) {
  if (!matrix.length) return [];
  return matrix[0].map((_, col) => matrix.map((row) => row[col]));
}

function pearson(a, b) {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = mean(a);
  const meanB = mean(b);
  let numerator = 0;
  let sumA = 0;
  let sumB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const deltaA = a[index] - meanA;
    const deltaB = b[index] - meanB;
    numerator += deltaA * deltaB;
    sumA += deltaA ** 2;
    sumB += deltaB ** 2;
  }
  const denominator = Math.sqrt(sumA * sumB);
  return denominator ? numerator / denominator : 0;
}

function euclidean(a, b) {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
}

function correlationMatrix(vectors) {
  return vectors.map((vectorA, row) => vectors.map((vectorB, col) => (row === col ? 1 : pearson(vectorA, vectorB))));
}

function normalizeGrid(input) {
  const grid = deepClone(input || demoGrid);
  grid.name = String(grid.name || "Griglia senza titolo");
  if (LEGACY_DEMO_NAMES.has(grid.name.trim())) grid.name = "Griglia senza titolo";
  grid.scale = grid.scale || { min: 1, max: 7 };
  grid.scale.min = safeNumber(grid.scale.min, 1);
  grid.scale.max = safeNumber(grid.scale.max, 7);
  if (grid.scale.max <= grid.scale.min) grid.scale.max = grid.scale.min + 1;
  grid.elements = Array.isArray(grid.elements) && grid.elements.length
    ? grid.elements.map((element, index) => String(element || `Elemento ${index + 1}`))
    : ["Elemento 1", "Elemento 2", "Elemento 3"];
  grid.constructs = Array.isArray(grid.constructs) && grid.constructs.length
    ? grid.constructs
    : [{ left: "Polo sinistro", right: "Polo destro", values: grid.elements.map(() => grid.scale.min) }];
  grid.constructs = grid.constructs.map((construct, rowIndex) => ({
    left: String(construct.left || `Polo sinistro ${rowIndex + 1}`),
    right: String(construct.right || `Polo destro ${rowIndex + 1}`),
    values: grid.elements.map((_, colIndex) =>
      clamp(safeNumber(construct.values?.[colIndex], grid.scale.min), grid.scale.min, grid.scale.max),
    ),
  }));
  return grid;
}

function loadInitialState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeGrid(JSON.parse(saved)) : normalizeGrid(demoGrid);
  } catch {
    return normalizeGrid(demoGrid);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getLabels(scope) {
  return scope === "constructs"
    ? state.constructs.map((construct) => `${construct.left} ↔ ${construct.right}`)
    : state.elements;
}

function getVectors(scope) {
  const rows = state.constructs.map((construct) => construct.values);
  return scope === "constructs" ? rows : transpose(rows);
}

function getPairDistances(vectors) {
  const distances = [];
  for (let first = 0; first < vectors.length; first += 1) {
    for (let second = first + 1; second < vectors.length; second += 1) {
      distances.push({ first, second, distance: euclidean(vectors[first], vectors[second]) });
    }
  }
  return distances;
}

function jacobiEigen(matrix) {
  const size = matrix.length;
  if (!size) return { values: [], vectors: [] };
  const a = matrix.map((row) => row.slice());
  const vectors = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => (row === col ? 1 : 0)),
  );
  const maxIterations = Math.max(30, size * size * 20);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let p = 0;
    let q = size > 1 ? 1 : 0;
    let max = 0;
    for (let row = 0; row < size; row += 1) {
      for (let col = row + 1; col < size; col += 1) {
        if (Math.abs(a[row][col]) > max) {
          max = Math.abs(a[row][col]);
          p = row;
          q = col;
        }
      }
    }
    if (max < 1e-11 || size === 1) break;
    const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    for (let index = 0; index < size; index += 1) {
      if (index !== p && index !== q) {
        const aip = a[index][p];
        const aiq = a[index][q];
        a[index][p] = cosine * aip - sine * aiq;
        a[p][index] = a[index][p];
        a[index][q] = sine * aip + cosine * aiq;
        a[q][index] = a[index][q];
      }
    }
    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    a[p][p] = cosine ** 2 * app - 2 * sine * cosine * apq + sine ** 2 * aqq;
    a[q][q] = sine ** 2 * app + 2 * sine * cosine * apq + cosine ** 2 * aqq;
    a[p][q] = 0;
    a[q][p] = 0;
    for (let row = 0; row < size; row += 1) {
      const vip = vectors[row][p];
      const viq = vectors[row][q];
      vectors[row][p] = cosine * vip - sine * viq;
      vectors[row][q] = sine * vip + cosine * viq;
    }
  }
  const pairs = a.map((row, index) => ({
    value: Math.max(0, row[index]),
    vector: vectors.map((vectorRow) => vectorRow[index]),
  })).sort((left, right) => right.value - left.value);
  return {
    values: pairs.map((pair) => pair.value),
    vectors: pairs[0] ? pairs[0].vector.map((_, row) => pairs.map((pair) => pair.vector[row])) : [],
  };
}

function calculatePca() {
  const observations = transpose(state.constructs.map((construct) => construct.values));
  const variableCount = state.constructs.length;
  if (observations.length < 2 || !variableCount) {
    return { eigenvalues: [], explained: [], loadings: [], scores: [], entropy: 0 };
  }
  const columnMeans = Array.from({ length: variableCount }, (_, col) =>
    mean(observations.map((row) => row[col])),
  );
  const centered = observations.map((row) => row.map((value, col) => value - columnMeans[col]));
  const covariance = Array.from({ length: variableCount }, (_, row) =>
    Array.from({ length: variableCount }, (_, col) =>
      centered.reduce((sum, observation) => sum + observation[row] * observation[col], 0)
      / Math.max(1, observations.length - 1),
    ),
  );
  const eigen = jacobiEigen(covariance);
  const total = eigen.values.reduce((sum, value) => sum + value, 0);
  const explained = eigen.values.map((value) => (total ? (value / total) * 100 : 0));
  const loadings = Array.from({ length: variableCount }, (_, variable) =>
    eigen.values.map((eigenvalue, component) =>
      eigen.vectors[variable][component] * Math.sqrt(Math.max(0, eigenvalue)),
    ),
  );
  const scores = centered.map((observation) =>
    eigen.values.map((_, component) =>
      observation.reduce((sum, value, variable) => sum + value * eigen.vectors[variable][component], 0),
    ),
  );
  const positive = explained.filter((value) => value > 1e-9).map((value) => value / 100);
  const entropy = positive.length > 1
    ? (-positive.reduce((sum, proportion) => sum + proportion * Math.log(proportion), 0) / Math.log(positive.length)) * 100
    : 0;
  return { eigenvalues: eigen.values, explained, loadings, scores, entropy };
}

function normalizedRating(value) {
  const range = state.scale.max - state.scale.min || 1;
  return ((value - state.scale.min) / range) * 2 - 1;
}

function normalizedDistanceValue(distance, dimensions) {
  const maxDistance = (state.scale.max - state.scale.min || 1) * Math.sqrt(Math.max(1, dimensions));
  return clamp(distance / maxDistance, 0, 1);
}

function proximityFromDistance(distance, dimensions) {
  return (1 - normalizedDistanceValue(distance, dimensions)) * 100;
}

function normalizeRoleText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectElementRoles() {
  const roles = { relational: [], possibleSelves: [] };
  state.elements.forEach((element, index) => {
    const text = normalizeRoleText(element);
    const ideal = /\bideal|ideale|desiderat|vorrei|aspirat/.test(text);
    const feared = /temut|paura|peggior|rifiutat|indesiderat|worst|minacci/.test(text);
    const seen = /altr.*ved|vedon|visto|vista|sguardo|come mi ved/.test(text);
    const futureDesired = /futur.*desider|desiderat.*futur/.test(text);
    const future = /futur|future|probabil|possibil|se cambia|se nulla cambia/.test(text);
    const self = /(^| )(io|me|mio|mia|se|self|attuale)( |$)/.test(text);
    const relational = /partner|madre|padre|figli|figlio|figlia|famigli|amico|amica|amic|collega|capo|responsabile|mentor|autorita|terapeuta|pari|gruppo/.test(text);

    if (seen && roles.seenByOthers === undefined) roles.seenByOthers = index;
    if (feared && roles.feared === undefined) roles.feared = index;
    if (futureDesired && roles.futureDesired === undefined) roles.futureDesired = index;
    if (future && roles.future === undefined) roles.future = index;
    if (ideal && roles.ideal === undefined) roles.ideal = index;
    if (self && !ideal && !feared && !future && !seen && roles.self === undefined) roles.self = index;
    if (relational) roles.relational.push(index);
    if (self || ideal || feared || future || futureDesired) roles.possibleSelves.push(index);
  });
  return roles;
}

function constructEntropy(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const raw = [...counts.values()].reduce((sum, count) => {
    const proportion = count / values.length;
    return sum - proportion * Math.log(proportion);
  }, 0);
  const integerScale = Number.isInteger(state.scale.min)
    && Number.isInteger(state.scale.max)
    && state.scale.max - state.scale.min <= 50;
  const categories = integerScale ? state.scale.max - state.scale.min + 1 : Math.max(2, counts.size);
  const normalized = categories > 1 ? (raw / Math.log(categories)) * 100 : 0;
  return { raw, normalized };
}

function calculateLoadConcentration(pca) {
  const weights = state.constructs.map((_, row) => {
    const first = pca.loadings[row]?.[0] || 0;
    const second = pca.loadings[row]?.[1] || 0;
    return first ** 2 + second ** 2;
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!total || weights.length < 2) return 0;
  const proportions = weights.map((value) => value / total);
  const hhi = proportions.reduce((sum, value) => sum + value ** 2, 0);
  return ((hhi - 1 / weights.length) / (1 - 1 / weights.length)) * 100;
}

function calculateBetweenness(adjacency) {
  const size = adjacency.length;
  const scores = Array(size).fill(0);
  for (let source = 0; source < size; source += 1) {
    const stack = [];
    const predecessors = Array.from({ length: size }, () => []);
    const sigma = Array(size).fill(0);
    const distance = Array(size).fill(-1);
    sigma[source] = 1;
    distance[source] = 0;
    const queue = [source];
    while (queue.length) {
      const vertex = queue.shift();
      stack.push(vertex);
      adjacency[vertex].forEach((connected, neighbor) => {
        if (!connected) return;
        if (distance[neighbor] < 0) {
          queue.push(neighbor);
          distance[neighbor] = distance[vertex] + 1;
        }
        if (distance[neighbor] === distance[vertex] + 1) {
          sigma[neighbor] += sigma[vertex];
          predecessors[neighbor].push(vertex);
        }
      });
    }
    const dependency = Array(size).fill(0);
    while (stack.length) {
      const node = stack.pop();
      predecessors[node].forEach((predecessor) => {
        dependency[predecessor] += (sigma[predecessor] / sigma[node]) * (1 + dependency[node]);
      });
      if (node !== source) scores[node] += dependency[node];
    }
  }
  const divisor = 2;
  const raw = scores.map((value) => value / divisor);
  const maxPossible = size > 2 ? ((size - 1) * (size - 2)) / 2 : 1;
  return raw.map((value) => clamp(value / maxPossible, 0, 1));
}

function calculateConstructNetwork(constructCorrelations) {
  const size = constructCorrelations.length;
  if (!size) return { nodes: [], threshold: 0.45 };
  const threshold = 0.45;
  const adjacency = constructCorrelations.map((row, rowIndex) =>
    row.map((value, colIndex) => rowIndex !== colIndex && Math.abs(value) >= threshold),
  );
  const betweenness = calculateBetweenness(adjacency);
  const distance = constructCorrelations.map((row, rowIndex) =>
    row.map((value, colIndex) => (rowIndex === colIndex ? 0 : 1 - Math.abs(value) + 0.001)),
  );
  for (let mid = 0; mid < size; mid += 1) {
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (distance[row][mid] + distance[mid][col] < distance[row][col]) {
          distance[row][col] = distance[row][mid] + distance[mid][col];
        }
      }
    }
  }
  const closenessRaw = distance.map((row, index) => {
    const total = row.reduce((sum, value, col) => (col === index ? sum : sum + value), 0);
    return total ? (size - 1) / total : 0;
  });
  const maxCloseness = Math.max(1e-9, ...closenessRaw);
  let eigen = Array(size).fill(1 / Math.sqrt(size));
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const next = constructCorrelations.map((row, rowIndex) =>
      row.reduce((sum, value, colIndex) => (rowIndex === colIndex ? sum : sum + Math.abs(value) * eigen[colIndex]), 0),
    );
    const norm = Math.sqrt(next.reduce((sum, value) => sum + value ** 2, 0)) || 1;
    eigen = next.map((value) => value / norm);
  }
  const maxEigen = Math.max(1e-9, ...eigen);
  const nodes = constructCorrelations.map((row, index) => {
    const absoluteLinks = row.filter((_, col) => col !== index).map(Math.abs);
    const weightedDegree = absoluteLinks.length ? mean(absoluteLinks) : 0;
    const strongDegree = absoluteLinks.length
      ? absoluteLinks.filter((value) => value >= threshold).length / absoluteLinks.length
      : 0;
    const closeness = closenessRaw[index] / maxCloseness;
    const eigenvector = eigen[index] / maxEigen;
    const centrality = mean([weightedDegree, closeness, eigenvector, betweenness[index]]);
    return { weightedDegree, strongDegree, closeness, eigenvector, betweenness: betweenness[index], centrality };
  });
  return { nodes, threshold };
}

function calculateDiscrepancies(roles) {
  const hasSelfIdeal = roles.self !== undefined && roles.ideal !== undefined;
  const range = state.scale.max - state.scale.min || 1;
  return state.constructs.map((construct) => {
    if (!hasSelfIdeal) {
      return { raw: 0, normalized: 0, deltaNormalized: 0, direction: 0, congruent: false, discrepant: false };
    }
    const selfValue = construct.values[roles.self];
    const idealValue = construct.values[roles.ideal];
    const raw = Math.abs(idealValue - selfValue);
    const normalized = raw / range;
    const deltaNormalized = normalizedRating(idealValue) - normalizedRating(selfValue);
    return {
      raw,
      normalized,
      deltaNormalized,
      direction: Math.sign(idealValue - selfValue),
      congruent: normalized <= 0.17,
      discrepant: normalized >= 0.25,
    };
  });
}

function calculateDilemmas(roles, discrepancies, network, constructCorrelations) {
  if (roles.self === undefined || roles.ideal === undefined) return { dilemmas: [], load: Array(state.constructs.length).fill(0) };
  const dilemmas = [];
  const load = Array(state.constructs.length).fill(0);
  state.constructs.forEach((_, discrepantIndex) => {
    if (!discrepancies[discrepantIndex].discrepant) return;
    state.constructs.forEach((__, congruentIndex) => {
      if (discrepantIndex === congruentIndex || !discrepancies[congruentIndex].congruent) return;
      const implication = constructCorrelations[discrepantIndex][congruentIndex];
      if (Math.abs(implication) < 0.35) return;
      const selfCongruent = normalizedRating(state.constructs[congruentIndex].values[roles.self]);
      const idealCongruent = normalizedRating(state.constructs[congruentIndex].values[roles.ideal]);
      const predictedShift = implication * discrepancies[discrepantIndex].deltaNormalized;
      const currentGap = Math.abs(selfCongruent - idealCongruent);
      const predictedGap = Math.abs(selfCongruent + predictedShift - idealCongruent);
      if (predictedGap <= currentGap + 0.05) return;
      const discrepancy = discrepancies[discrepantIndex].normalized;
      const identityRelevance = network.nodes[congruentIndex]?.centrality || 0;
      const gravity = discrepancy * Math.abs(implication) * identityRelevance;
      const dilemma = { discrepantIndex, congruentIndex, implication, discrepancy, identityRelevance, gravity };
      dilemmas.push(dilemma);
      load[discrepantIndex] += gravity;
      load[congruentIndex] += gravity * 0.5;
    });
  });
  const maxLoad = Math.max(1e-9, ...load);
  return { dilemmas, load: load.map((value) => value / maxLoad) };
}

function directionLabel(construct, direction) {
  if (!direction) return "nessuna direzione chiara";
  return direction < 0 ? `verso "${construct.left}"` : `verso "${construct.right}"`;
}

function calculateChangeCosts(roles, discrepancies, network, dilemmaLoad) {
  if (roles.self === undefined || roles.ideal === undefined) return [];
  return state.constructs.map((construct, index) => {
    const polarization = construct.values.filter((value) => value === state.scale.min || value === state.scale.max).length / state.elements.length;
    const benefit = discrepancies[index].normalized;
    const centrality = network.nodes[index]?.centrality || 0;
    const identityCost = centrality * polarization;
    const dilemmaCost = dilemmaLoad[index] || 0;
    const threat = roles.feared !== undefined
      ? 1 - Math.abs(construct.values[roles.ideal] - construct.values[roles.feared]) / (state.scale.max - state.scale.min || 1)
      : 0;
    const risk = clamp(identityCost * 0.35 + dilemmaCost * 0.35 + threat * 0.3, 0, 1);
    const safety = benefit > 0 ? benefit / (benefit + risk + 0.001) : 0;
    return {
      index,
      benefit,
      identityCost,
      dilemmaCost,
      threat: clamp(threat, 0, 1),
      risk,
      safety,
      direction: directionLabel(construct, discrepancies[index].direction),
      discrepant: discrepancies[index].discrepant,
    };
  }).filter((entry) => entry.discrepant);
}

function calculateSelfGeometry(roles) {
  const vectors = getVectors("elements");
  const geometry = { attractors: [], missing: [] };
  if (roles.self === undefined) {
    geometry.missing.push("sé attuale");
    return geometry;
  }
  const selfVector = vectors[roles.self];
  geometry.attractors = vectors.map((vector, index) => {
    const distance = euclidean(selfVector, vector);
    return {
      index,
      distance,
      proximity: proximityFromDistance(distance, state.constructs.length),
      inverse: 1 / (distance + 0.001),
    };
  }).filter((item) => item.index !== roles.self).sort((a, b) => a.distance - b.distance);
  const pair = (roleName, key) => {
    if (roles[key] === undefined) {
      geometry.missing.push(roleName);
      return undefined;
    }
    const distance = euclidean(selfVector, vectors[roles[key]]);
    return { distance, proximity: proximityFromDistance(distance, state.constructs.length) };
  };
  geometry.selfIdeal = pair("sé ideale", "ideal");
  geometry.selfFeared = pair("sé temuto", "feared");
  if (roles.ideal !== undefined && roles.feared !== undefined) {
    const distance = euclidean(vectors[roles.ideal], vectors[roles.feared]);
    geometry.idealFeared = { distance, proximity: proximityFromDistance(distance, state.constructs.length) };
  }
  if (roles.seenByOthers !== undefined) {
    const distance = euclidean(selfVector, vectors[roles.seenByOthers]);
    geometry.externalGaze = { distance, proximity: proximityFromDistance(distance, state.constructs.length) };
  }
  if (roles.future !== undefined && roles.ideal !== undefined) {
    const selfIdealDistance = euclidean(selfVector, vectors[roles.ideal]);
    const futureIdealDistance = euclidean(vectors[roles.future], vectors[roles.ideal]);
    geometry.agencyVector = (normalizedDistanceValue(selfIdealDistance, state.constructs.length)
      - normalizedDistanceValue(futureIdealDistance, state.constructs.length)) * 100;
    if (roles.feared !== undefined) {
      const futureFearedDistance = euclidean(vectors[roles.future], vectors[roles.feared]);
      geometry.futureAccessibility = proximityFromDistance(futureIdealDistance, state.constructs.length)
        - proximityFromDistance(futureFearedDistance, state.constructs.length);
    }
  }
  if (roles.possibleSelves.length > 1) {
    const distances = [];
    for (let first = 0; first < roles.possibleSelves.length; first += 1) {
      for (let second = first + 1; second < roles.possibleSelves.length; second += 1) {
        distances.push(normalizedDistanceValue(
          euclidean(vectors[roles.possibleSelves[first]], vectors[roles.possibleSelves[second]]),
          state.constructs.length,
        ));
      }
    }
    geometry.possibleSelfDifferentiation = mean(distances) * 100;
  }
  return geometry;
}

function calculateConstructInstability() {
  if (state.elements.length < 4 || state.constructs.length < 2) return Array(state.constructs.length).fill(0);
  const base = calculateConstructNetwork(correlationMatrix(getVectors("constructs"))).nodes.map((node) => node.weightedDegree);
  const changes = state.constructs.map(() => []);
  state.elements.forEach((_, omittedElement) => {
    const vectors = state.constructs.map((construct) => construct.values.filter((__, index) => index !== omittedElement));
    const centrality = calculateConstructNetwork(correlationMatrix(vectors)).nodes.map((node) => node.weightedDegree);
    centrality.forEach((value, index) => changes[index].push(Math.abs(value - base[index])));
  });
  const raw = changes.map((values) => mean(values));
  const max = Math.max(1e-9, ...raw);
  return raw.map((value) => value / max);
}

function cutTree(root, targetClusters) {
  const clusters = [root];
  const canSplit = (node) => node && node.leaf === undefined;
  while (clusters.length < targetClusters) {
    let splitIndex = -1;
    let splitHeight = -1;
    clusters.forEach((cluster, index) => {
      if (canSplit(cluster) && cluster.height > splitHeight) {
        splitHeight = cluster.height;
        splitIndex = index;
      }
    });
    if (splitIndex < 0) break;
    const [cluster] = clusters.splice(splitIndex, 1);
    clusters.push(cluster.left, cluster.right);
  }
  return clusters.map((cluster) => cluster.members || [cluster.leaf]);
}

function calculateLocalDissonance() {
  const vectors = getVectors("elements");
  if (vectors.length < 3) return [];
  const root = hierarchicalCluster(vectors, "average");
  const clusters = cutTree(root, Math.min(3, Math.max(2, Math.round(Math.sqrt(vectors.length)))));
  const clusterForElement = new Map();
  clusters.forEach((cluster, clusterIndex) => cluster.forEach((elementIndex) => clusterForElement.set(elementIndex, clusterIndex)));
  return vectors.map((vector, index) => {
    const cluster = clusters[clusterForElement.get(index)];
    const centroid = vector.map((_, col) => mean(cluster.map((elementIndex) => vectors[elementIndex][col])));
    const distance = euclidean(vector, centroid);
    return { index, distance, score: normalizedDistanceValue(distance, state.constructs.length) };
  }).sort((a, b) => b.score - a.score);
}

function calculateRatingInconsistencies(constructCorrelations) {
  const zVectors = state.constructs.map((construct) => {
    const average = mean(construct.values);
    const deviation = sd(construct.values) || 1;
    return construct.values.map((value) => (value - average) / deviation);
  });
  const anomalies = [];
  for (let first = 0; first < state.constructs.length; first += 1) {
    for (let second = first + 1; second < state.constructs.length; second += 1) {
      const corr = constructCorrelations[first][second];
      if (Math.abs(corr) < 0.65) continue;
      const sign = Math.sign(corr) || 1;
      state.elements.forEach((element, elementIndex) => {
        const residual = Math.abs(zVectors[first][elementIndex] - sign * zVectors[second][elementIndex]);
        if (residual >= 1.25) anomalies.push({ first, second, elementIndex, residual, corr });
      });
    }
  }
  return anomalies.sort((a, b) => b.residual - a.residual);
}

function calculateDynamics(analysis) {
  const roles = detectElementRoles();
  const network = calculateConstructNetwork(analysis.constructCorrelations);
  const entropies = state.constructs.map((construct) => constructEntropy(construct.values));
  const cse = mean(entropies.map((entry) => entry.normalized));
  const crci1 = analysis.pca.explained[0] || 0;
  const crci2 = (analysis.pca.explained[0] || 0) + (analysis.pca.explained[1] || 0);
  const coi = clamp(100 - analysis.intensity, 0, 100);
  const clci = calculateLoadConcentration(analysis.pca);
  const discrepancies = calculateDiscrepancies(roles);
  const dilemmaData = calculateDilemmas(roles, discrepancies, network, analysis.constructCorrelations);
  const changeCosts = calculateChangeCosts(roles, discrepancies, network, dilemmaData.load);
  const instability = calculateConstructInstability();
  const constructProfiles = state.constructs.map((construct, index) => {
    const spi = construct.values.filter((value) => value === state.scale.min || value === state.scale.max).length / state.elements.length;
    const differentiation = clamp(sd(construct.values) / ((state.scale.max - state.scale.min || 1) / 2), 0, 1);
    const redundancy = network.nodes[index]?.weightedDegree || 0;
    const moderatePolarization = clamp(1 - Math.abs(spi - 0.25) / 0.75, 0, 1);
    const lowRedundancy = 1 - redundancy;
    const lowDilemma = 1 - (dilemmaData.load[index] || 0);
    const cpp = clamp(differentiation * moderatePolarization * lowRedundancy * lowDilemma, 0, 1);
    const centrality = network.nodes[index]?.centrality || 0;
    const discrepancy = discrepancies[index].normalized;
    const cost = changeCosts.find((entry) => entry.index === index);
    const safety = cost ? cost.safety : clamp(1 - mean([centrality, dilemmaData.load[index] || 0, spi]), 0, 1);
    const relevance = Math.max(centrality, discrepancy);
    const ctr = clamp(relevance * discrepancy * cpp * safety, 0, 1);
    const mesi = clamp(cpp * safety * (1 - centrality) * (1 - (dilemmaData.load[index] || 0)) * Math.max(discrepancy, 0.25), 0, 1);
    const fragility = clamp(centrality * spi * discrepancy * (dilemmaData.load[index] || 0), 0, 1);
    return {
      index,
      entropy: entropies[index].normalized,
      spi,
      differentiation,
      redundancy,
      moderatePolarization,
      cpp,
      ctr,
      mesi,
      centrality,
      bridge: network.nodes[index]?.betweenness || 0,
      strongDegree: network.nodes[index]?.strongDegree || 0,
      fragility,
      discrepancy,
      dilemmaLoad: dilemmaData.load[index] || 0,
      instability: instability[index] || 0,
      direction: directionLabel(construct, discrepancies[index].direction),
    };
  });
  const possiblePairs = state.constructs.length > 1 ? (state.constructs.length * (state.constructs.length - 1)) / 2 : 1;
  return {
    roles,
    cse,
    crci1,
    crci2,
    coi,
    clci,
    network,
    discrepancies,
    dilemmas: dilemmaData.dilemmas,
    dilemmaDensity: (dilemmaData.dilemmas.length / possiblePairs) * 100,
    changeCosts,
    safeChangeCorridor: changeCosts.length ? mean(changeCosts.map((entry) => entry.safety)) * 100 : null,
    constructProfiles,
    selfGeometry: calculateSelfGeometry(roles),
    ratingInconsistencies: calculateRatingInconsistencies(analysis.constructCorrelations),
    localDissonance: calculateLocalDissonance(),
  };
}

function calculateAnalysis() {
  const ratings = state.constructs.flatMap((construct) => construct.values);
  const constructVectors = getVectors("constructs");
  const elementVectors = getVectors("elements");
  const constructCorrelations = correlationMatrix(constructVectors);
  const scaleRange = state.scale.max - state.scale.min;
  const midpoint = (state.scale.max + state.scale.min) / 2;
  const totalCells = Math.max(1, ratings.length);
  const polarization = (ratings.filter((rating) => rating === state.scale.min || rating === state.scale.max).length / totalCells) * 100;
  const midpointUse = (ratings.filter((rating) => Math.abs(rating - midpoint) < 1e-9).length / totalCells) * 100;
  const pairCorrelations = [];
  let correlationSum = 0;
  let correlationCount = 0;
  for (let first = 0; first < constructVectors.length; first += 1) {
    for (let second = first + 1; second < constructVectors.length; second += 1) {
      const value = constructCorrelations[first][second];
      correlationSum += Math.abs(value);
      correlationCount += 1;
      pairCorrelations.push({ first, second, value });
    }
  }
  let bieriAgreements = 0;
  let bieriPossible = 0;
  for (let first = 0; first < constructVectors.length; first += 1) {
    for (let second = first + 1; second < constructVectors.length; second += 1) {
      for (let element = 0; element < state.elements.length; element += 1) {
        bieriPossible += 1;
        if (constructVectors[first][element] === constructVectors[second][element]) bieriAgreements += 1;
      }
    }
  }
  const elementDistances = getPairDistances(elementVectors);
  const constructDistances = getPairDistances(constructVectors);
  const maxElementDistance = scaleRange * Math.sqrt(Math.max(1, state.constructs.length));
  const maxConstructDistance = scaleRange * Math.sqrt(Math.max(1, state.elements.length));
  const pca = calculatePca();
  return {
    ratings,
    average: mean(ratings),
    standardDeviation: sd(ratings),
    polarization,
    midpointUse,
    constructCorrelations,
    pairCorrelations,
    intensity: correlationCount ? (correlationSum / correlationCount) * 100 : 0,
    bieriAgreements,
    bieriPossible,
    bieriDifferentiation: bieriPossible ? (1 - bieriAgreements / bieriPossible) * 100 : 0,
    elementDifferentiation: maxElementDistance
      ? (mean(elementDistances.map((pair) => pair.distance)) / maxElementDistance) * 100
      : 0,
    constructDifferentiation: maxConstructDistance
      ? (mean(constructDistances.map((pair) => pair.distance)) / maxConstructDistance) * 100
      : 0,
    elementDistances,
    constructDistances,
    pca,
  };
}

function metricCard(label, value, unit, hint) {
  return `
    <article class="metric-card">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(value)}${unit ? `<span class="unit">${escapeHtml(unit)}</span>` : ""}</span>
      <span class="hint">${escapeHtml(hint)}</span>
    </article>`;
}

function insightCard(title, text, tone = "") {
  return `<div class="insight-card ${tone}"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`;
}

function renderDashboard(analysis) {
  document.getElementById("gridNameLabel").textContent = state.name;
  const dashboardNameInput = document.getElementById("dashboardGridNameInput");
  if (document.activeElement !== dashboardNameInput) dashboardNameInput.value = state.name;
  document.getElementById("dashboardSubtitle").textContent =
    `${state.constructs.length} costrutti bipolari × ${state.elements.length} elementi · scala ${state.scale.min}–${state.scale.max}`;
  document.getElementById("mainMetrics").innerHTML = [
    metricCard("Elementi", state.elements.length, "", "oggetti valutati"),
    metricCard("Costrutti", state.constructs.length, "", "dimensioni bipolari"),
    metricCard("Intensità", fmt(analysis.intensity), "%", "media |r| tra costrutti"),
    metricCard("Polarizzazione", fmt(analysis.polarization), "%", "punteggi ai poli estremi"),
  ].join("");

  const indicators = [
    ["Differenziazione di Bieri", analysis.bieriDifferentiation, "teal"],
    ["Intensità correlazionale", analysis.intensity, "berry"],
    ["Differenziazione elementi", analysis.elementDifferentiation, "ochre"],
    ["Entropia delle componenti", analysis.pca.entropy, "teal"],
    ["Uso del punto medio", analysis.midpointUse, "ochre"],
  ];
  document.getElementById("indicatorList").innerHTML = indicators.map(([name, value, tone]) => `
    <div class="indicator-row">
      <span class="name">${escapeHtml(name)}</span>
      <div class="bar-track"><div class="bar-value ${tone}" style="width:${clamp(value, 0, 100)}%"></div></div>
      <span class="score">${fmt(value)}%</span>
    </div>`).join("");

  document.getElementById("scaleDistribution").innerHTML = renderDistribution(analysis.ratings);
  document.getElementById("dashboardHeatmap").innerHTML = renderHeatmap(
    analysis.constructCorrelations.slice(0, 7).map((row) => row.slice(0, 7)),
    getLabels("constructs").slice(0, 7),
    { width: 590, compact: true },
  );
  document.getElementById("insightList").innerHTML = renderDashboardInsights(analysis);
}

function renderDashboardInsights(analysis) {
  const strongest = [...analysis.pairCorrelations].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  const insights = [];
  if (strongest) {
    const labels = getLabels("constructs");
    insights.push(insightCard(
      `Legame più forte · r = ${fmtSmart(strongest.value)}`,
      `${labels[strongest.first]} / ${labels[strongest.second]}`,
      "teal",
    ));
  }
  insights.push(insightCard(
    `Componente principale · ${fmt(analysis.pca.explained[0] || 0)}%`,
    "Quota di varianza raccolta dalla prima componente: utile per leggere quanto la griglia si organizza attorno a una dimensione dominante.",
  ));
  insights.push(insightCard(
    `Accordi Bieri · ${analysis.bieriAgreements}/${analysis.bieriPossible}`,
    "Il conteggio originale misura quante valutazioni coincidono tra coppie di costrutti: più accordi indicano minore differenziazione.",
    "berry",
  ));
  return insights.join("");
}

function renderDistribution(ratings) {
  const values = [];
  for (let value = state.scale.min; value <= state.scale.max; value += 1) values.push(value);
  const counts = values.map((value) => ratings.filter((rating) => rating === value).length);
  const maxCount = Math.max(1, ...counts);
  return `
    <div class="distribution-chart">
      ${values.map((value, index) => `
        <div class="distribution-column">
          <span class="distribution-value">${counts[index]}</span>
          <div class="distribution-bar" style="height:${Math.max(3, (counts[index] / maxCount) * 126)}px"></div>
          <span class="distribution-label">${escapeHtml(value)}</span>
        </div>`).join("")}
    </div>
    <p class="chart-caption">Frequenze assolute dei punteggi sulla scala ${escapeHtml(state.scale.min)}–${escapeHtml(state.scale.max)}.</p>`;
}

function heatColor(value) {
  const amount = clamp(Math.abs(value), 0, 1);
  if (value >= 0) {
    return `rgb(${Math.round(239 - amount * 181)}, ${Math.round(244 - amount * 101)}, ${Math.round(241 - amount * 104)})`;
  }
  return `rgb(${Math.round(247 - amount * 34)}, ${Math.round(241 - amount * 143)}, ${Math.round(232 - amount * 119)})`;
}

function renderHeatmap(matrix, labels, options = {}) {
  if (!labels.length) return '<p class="muted small">Dati insufficienti.</p>';
  const width = options.width || 680;
  const fontSize = options.compact ? 10 : 11;
  const displayedLabels = labels.map((label) => shorten(label, options.compact ? 18 : 24));
  const maxLabelWidth = Math.max(
    1,
    ...displayedLabels.map((label) => label.length * fontSize * 0.62),
  );
  const labelSpace = Math.max(options.compact ? 132 : 166, Math.ceil(maxLabelWidth + 18));
  const cell = clamp(Math.floor((width - labelSpace - 18) / labels.length), 28, options.compact ? 48 : 53);
  const rightMargin = Math.max(24, Math.ceil(maxLabelWidth * 0.58 + 14));
  const top = Math.max(options.compact ? 100 : 140, Math.ceil(maxLabelWidth * 0.82 + 20));
  const chartWidth = labelSpace + cell * labels.length + rightMargin;
  const chartHeight = top + cell * labels.length + 16;
  const cells = matrix.flatMap((row, rowIndex) =>
    row.map((value, colIndex) => `
      <rect x="${labelSpace + colIndex * cell}" y="${top + rowIndex * cell}" width="${cell - 2}" height="${cell - 2}"
        rx="4" fill="${heatColor(value)}">
        <title>${escapeHtml(labels[rowIndex])} / ${escapeHtml(labels[colIndex])}: r = ${fmtSmart(value)}</title>
      </rect>
      <text x="${labelSpace + colIndex * cell + (cell - 2) / 2}" y="${top + rowIndex * cell + cell / 2 + 3}"
        text-anchor="middle" font-size="${fontSize}" fill="${Math.abs(value) > 0.66 ? "#fff" : "#37514f"}">${fmtSmart(value, 1)}</text>`),
  ).join("");
  const rowLabels = labels.map((label, index) => `
    <text x="${labelSpace - 8}" y="${top + index * cell + cell / 2 + 3}" text-anchor="end" font-size="${fontSize}"
      fill="#60706e">${escapeHtml(displayedLabels[index])}</text>`).join("");
  const columnLabels = displayedLabels.map((label, index) => `
    <text x="${labelSpace + index * cell + cell / 2}" y="${top - 8}" text-anchor="start" font-size="${fontSize}"
      fill="#60706e" transform="rotate(-55 ${labelSpace + index * cell + cell / 2} ${top - 8})">${escapeHtml(label)}</text>`).join("");
  return `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" width="${chartWidth}" height="${chartHeight}" role="img" aria-label="Heatmap delle correlazioni">
    ${rowLabels}${columnLabels}${cells}
  </svg>`;
}

function renderGridEditor() {
  document.getElementById("matrixDimensions").textContent =
    `${state.constructs.length} costrutti × ${state.elements.length} elementi`;
  document.getElementById("gridNameInput").value = state.name;
  document.getElementById("scaleMin").value = state.scale.min;
  document.getElementById("scaleMax").value = state.scale.max;
  const head = `
    <thead><tr>
      <th class="pole-col">Polo sinistro · valore ${escapeHtml(state.scale.min)}</th>
      ${state.elements.map((element, index) => `
        <th>
          <input class="label-input" aria-label="Nome elemento ${index + 1}" data-element-name="${index}" value="${escapeHtml(element)}" />
          ${state.elements.length > 2 ? `<button class="remove-button" data-remove-element="${index}" aria-label="Rimuovi elemento ${escapeHtml(element)}">×</button>` : ""}
        </th>`).join("")}
      <th class="pole-col">Polo destro · valore ${escapeHtml(state.scale.max)}</th>
      <th class="remove-column"></th>
    </tr></thead>`;
  const body = `
    <tbody>
      ${state.constructs.map((construct, row) => `
        <tr>
          <td><input class="label-input" aria-label="Polo sinistro costrutto ${row + 1}" data-construct-left="${row}" value="${escapeHtml(construct.left)}" /></td>
          ${construct.values.map((value, col) => `
            <td><input class="cell-input" aria-label="${escapeHtml(construct.left)}, ${escapeHtml(state.elements[col])}" data-score-row="${row}" data-score-col="${col}" type="number" min="${state.scale.min}" max="${state.scale.max}" step="1" value="${value}" /></td>`).join("")}
          <td><input class="label-input" aria-label="Polo destro costrutto ${row + 1}" data-construct-right="${row}" value="${escapeHtml(construct.right)}" /></td>
          <td class="remove-column">${state.constructs.length > 1 ? `<button class="remove-button" data-remove-construct="${row}" aria-label="Rimuovi costrutto ${escapeHtml(construct.left)}">×</button>` : ""}</td>
        </tr>`).join("")}
    </tbody>`;
  document.getElementById("gridEditorTable").innerHTML = head + body;
}

function renderCorrelations(analysis) {
  const scope = document.getElementById("correlationScope").value;
  const labels = getLabels(scope);
  const matrix = scope === "constructs" ? analysis.constructCorrelations : correlationMatrix(getVectors("elements"));
  document.getElementById("correlationHeatmapTitle").textContent =
    scope === "constructs" ? "Heatmap dei costrutti" : "Heatmap degli elementi";
  document.getElementById("correlationHeatmap").innerHTML = renderHeatmap(matrix, labels, { width: 760 });
  const pairs = [];
  for (let first = 0; first < labels.length; first += 1) {
    for (let second = first + 1; second < labels.length; second += 1) {
      pairs.push({ first, second, value: matrix[first][second] });
    }
  }
  pairs.sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
  document.getElementById("correlationHighlights").innerHTML = pairs.length
    ? pairs.slice(0, 6).map((pair, index) => insightCard(
      `${index + 1}. r = ${fmtSmart(pair.value)}`,
      `${labels[pair.first]} / ${labels[pair.second]}`,
      pair.value >= 0 ? "teal" : "berry",
    )).join("")
    : insightCard("Dati insufficienti", "Servono almeno due righe o colonne per calcolare le associazioni.");
  document.getElementById("correlationTable").innerHTML = renderMatrixTable(labels, matrix, "r");
}

function percent(value) {
  return `${fmt(value * 100)}%`;
}

function renderTableMessage(columns, message) {
  return `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
    <tbody><tr><td colspan="${columns.length}">${escapeHtml(message)}</td></tr></tbody>`;
}

function renderDynamics(dynamics) {
  const safeCorridorValue = dynamics.safeChangeCorridor === null ? "—" : fmt(dynamics.safeChangeCorridor);
  document.getElementById("dynamicsMetrics").innerHTML = [
    metricCard("CSE", fmt(dynamics.cse), "%", "entropia media dei costrutti"),
    metricCard("CRCI 1", fmt(dynamics.crci1), "%", "varianza spiegata dalla prima componente"),
    metricCard("COI", fmt(dynamics.coi), "%", "ortogonalità media dei costrutti"),
    metricCard("CLCI", fmt(dynamics.clci), "%", "concentrazione dei carichi PCA"),
    metricCard("IDD", fmt(dynamics.dilemmaDensity), "%", "densità dei dilemmi implicativi"),
    metricCard("SCCI", safeCorridorValue, dynamics.safeChangeCorridor === null ? "" : "%", "sicurezza media del cambiamento"),
  ].join("");

  const roleNotice = document.getElementById("roleNotice");
  const missing = [];
  if (dynamics.roles.self === undefined) missing.push("sé attuale");
  if (dynamics.roles.ideal === undefined) missing.push("sé ideale");
  if (dynamics.roles.feared === undefined) missing.push("sé temuto");
  if (dynamics.roles.future === undefined) missing.push("sé futuro");
  if (dynamics.roles.seenByOthers === undefined) missing.push("sguardo esterno");
  if (missing.length) {
    roleNotice.classList.add("visible");
    roleNotice.textContent = `Ruoli non riconosciuti: ${missing.join(", ")}. Le misure che li richiedono restano disattivate o vengono calcolate come proxy parziali.`;
  } else {
    roleNotice.classList.remove("visible");
    roleNotice.textContent = "";
  }

  document.getElementById("constructDynamicsTable").innerHTML = `
    <thead><tr>
      <th>Costrutto</th><th>Entropia</th><th>Centralità</th><th>Bridge</th><th>Polar.</th><th>Fragilità</th><th>Instabilità</th>
    </tr></thead>
    <tbody>
      ${[...dynamics.constructProfiles].sort((a, b) => b.centrality - a.centrality).map((profile) => {
        const construct = state.constructs[profile.index];
        return `<tr>
          <td>${escapeHtml(shorten(`${construct.left} ↔ ${construct.right}`, 34))}</td>
          <td>${fmt(profile.entropy)}%</td>
          <td>${percent(profile.centrality)}</td>
          <td>${percent(profile.bridge)}</td>
          <td>${percent(profile.spi)}</td>
          <td>${percent(profile.fragility)}</td>
          <td>${percent(profile.instability)}</td>
        </tr>`;
      }).join("")}
    </tbody>`;

  renderSelfGeometry(dynamics);
  renderChangeCost(dynamics);
  renderReadiness(dynamics);
  renderSelectivePolarization(dynamics);
  renderAnomalies(dynamics);
}

function roleLabel(roles, key) {
  return roles[key] === undefined ? "non riconosciuto" : state.elements[roles[key]];
}

function renderSelfGeometry(dynamics) {
  const geometry = dynamics.selfGeometry;
  const cards = [
    insightCard(
      "Ruoli riconosciuti",
      `Sé: ${roleLabel(dynamics.roles, "self")} · Ideale: ${roleLabel(dynamics.roles, "ideal")} · Temuto: ${roleLabel(dynamics.roles, "feared")}`,
      "teal",
    ),
  ];
  if (geometry.selfIdeal) {
    cards.push(insightCard("Self-Ideal Congruence", `Prossimità sé attuale/sé ideale: ${fmt(geometry.selfIdeal.proximity)}%. Distanza euclidea: ${fmtSmart(geometry.selfIdeal.distance, 2)}.`));
  }
  if (geometry.selfFeared) {
    cards.push(insightCard("Feared Self Proximity", `Prossimità sé attuale/sé temuto: ${fmt(geometry.selfFeared.proximity)}%. Valori alti indicano maggiore vicinanza alla configurazione temuta.`, "berry"));
  }
  if (geometry.idealFeared) {
    cards.push(insightCard("Ideal-Feared Collision", `Prossimità sé ideale/sé temuto: ${fmt(geometry.idealFeared.proximity)}%.`, "berry"));
  }
  if (geometry.externalGaze) {
    cards.push(insightCard("External Gaze Alignment", `Allineamento tra sé attuale e sguardo esterno: ${fmt(geometry.externalGaze.proximity)}%.`));
  }
  if (geometry.futureAccessibility !== undefined || geometry.agencyVector !== undefined) {
    cards.push(insightCard(
      "Futuro e agency",
      `FSAI: ${geometry.futureAccessibility === undefined ? "non calcolabile" : fmt(geometry.futureAccessibility)} · AVI: ${geometry.agencyVector === undefined ? "non calcolabile" : fmt(geometry.agencyVector)}.`,
      "teal",
    ));
  }
  if (geometry.possibleSelfDifferentiation !== undefined) {
    cards.push(insightCard("Possible Self Differentiation", `Distanza media tra versioni del sé: ${fmt(geometry.possibleSelfDifferentiation)}%.`));
  }
  if (geometry.attractors?.length) {
    cards.push(insightCard(
      "Attrattori del sé",
      geometry.attractors.slice(0, 3).map((item) => `${state.elements[item.index]} (${fmt(item.proximity)}%)`).join(" · "),
      "teal",
    ));
  }
  if (cards.length === 1) {
    cards.push(insightCard("Geometria non disponibile", "Inserisci un elemento chiamato “Io”, “Sé attuale” o simile per calcolare gli attrattori del sé.", "berry"));
  }
  document.getElementById("selfGeometryPanel").innerHTML = cards.join("");
}

function renderChangeCost(dynamics) {
  document.getElementById("dilemmaBadge").textContent = `${dynamics.dilemmas.length} dilemmi`;
  const columns = ["Costrutto", "Direzione", "Beneficio", "Dilemma", "Minaccia", "Rischio", "Sicurezza"];
  if (dynamics.roles.self === undefined || dynamics.roles.ideal === undefined) {
    document.getElementById("changeCostTable").innerHTML = renderTableMessage(columns, "Servono elementi riconoscibili come sé attuale e sé ideale.");
    return;
  }
  if (!dynamics.changeCosts.length) {
    document.getElementById("changeCostTable").innerHTML = renderTableMessage(columns, "Nessun costrutto discrepante secondo la soglia operativa corrente.");
    return;
  }
  document.getElementById("changeCostTable").innerHTML = `
    <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
    <tbody>
      ${[...dynamics.changeCosts].sort((a, b) => b.risk - a.risk).map((entry) => {
        const construct = state.constructs[entry.index];
        return `<tr>
          <td>${escapeHtml(shorten(`${construct.left} ↔ ${construct.right}`, 30))}</td>
          <td>${escapeHtml(entry.direction)}</td>
          <td>${percent(entry.benefit)}</td>
          <td>${percent(entry.dilemmaCost)}</td>
          <td>${percent(entry.threat)}</td>
          <td>${percent(entry.risk)}</td>
          <td>${percent(entry.safety)}</td>
        </tr>`;
      }).join("")}
    </tbody>`;
}

function renderReadiness(dynamics) {
  document.getElementById("readinessTable").innerHTML = `
    <thead><tr><th>Costrutto</th><th>CPP</th><th>CTR</th><th>MESI</th><th>Target</th></tr></thead>
    <tbody>
      ${[...dynamics.constructProfiles].sort((a, b) => b.mesi - a.mesi).slice(0, 8).map((profile) => {
        const construct = state.constructs[profile.index];
        return `<tr>
          <td>${escapeHtml(shorten(`${construct.left} ↔ ${construct.right}`, 25))}</td>
          <td>${percent(profile.cpp)}</td>
          <td>${percent(profile.ctr)}</td>
          <td>${percent(profile.mesi)}</td>
          <td>${escapeHtml(shorten(profile.direction, 22))}</td>
        </tr>`;
      }).join("")}
    </tbody>`;
}

function renderSelectivePolarization(dynamics) {
  document.getElementById("selectivePolarizationTable").innerHTML = `
    <thead><tr><th>Costrutto</th><th>SPI</th><th>Differenz.</th><th>Ridondanza</th><th>Estremi</th></tr></thead>
    <tbody>
      ${[...dynamics.constructProfiles].sort((a, b) => b.spi - a.spi).map((profile) => {
        const construct = state.constructs[profile.index];
        const extremes = construct.values.filter((value) => value === state.scale.min || value === state.scale.max).length;
        return `<tr>
          <td>${escapeHtml(shorten(`${construct.left} ↔ ${construct.right}`, 31))}</td>
          <td>${percent(profile.spi)}</td>
          <td>${percent(profile.differentiation)}</td>
          <td>${percent(profile.redundancy)}</td>
          <td>${extremes}/${state.elements.length}</td>
        </tr>`;
      }).join("")}
    </tbody>`;
}

function renderAnomalies(dynamics) {
  const rows = [];
  dynamics.ratingInconsistencies.slice(0, 4).forEach((item) => {
    rows.push({
      type: "Rating inconsistency",
      target: state.elements[item.elementIndex],
      value: item.residual,
      note: `${shorten(state.constructs[item.first].left, 13)} / ${shorten(state.constructs[item.second].left, 13)} · r=${fmtSmart(item.corr)}`,
    });
  });
  dynamics.localDissonance.slice(0, 4).forEach((item) => {
    rows.push({
      type: "Local dissonance",
      target: state.elements[item.index],
      value: item.score,
      note: "distanza dal centroide del cluster",
    });
  });
  const columns = ["Tipo", "Elemento", "Valore", "Lettura"];
  document.getElementById("anomalyTable").innerHTML = rows.length
    ? `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.sort((a, b) => b.value - a.value).map((row) => `<tr>
          <td>${escapeHtml(row.type)}</td>
          <td>${escapeHtml(shorten(row.target, 24))}</td>
          <td>${row.type === "Local dissonance" ? percent(row.value) : fmtSmart(row.value, 2)}</td>
          <td>${escapeHtml(row.note)}</td>
        </tr>`).join("")}
      </tbody>`
    : renderTableMessage(columns, "Nessuna anomalia locale sopra le soglie operative.");
}

function renderMatrixTable(labels, matrix, type = "number") {
  return `
    <thead><tr><th></th>${labels.map((label) => `<th>${escapeHtml(shorten(label, 22))}</th>`).join("")}</tr></thead>
    <tbody>
      ${labels.map((label, row) => `
        <tr>
          <td title="${escapeHtml(label)}">${escapeHtml(shorten(label, 31))}</td>
          ${matrix[row].map((value) => `<td>${type === "r" ? fmtSmart(value) : fmtSmart(value, 1)}</td>`).join("")}
        </tr>`).join("")}
    </tbody>`;
}

function renderFactors(analysis) {
  const pca = analysis.pca;
  const cumulativeTwo = (pca.explained[0] || 0) + (pca.explained[1] || 0);
  document.getElementById("pcaMetrics").innerHTML = [
    metricCard("Prima componente", fmt(pca.explained[0] || 0), "%", "varianza spiegata"),
    metricCard("Prime due componenti", fmt(cumulativeTwo), "%", "varianza cumulata"),
    metricCard("Entropia componenti", fmt(pca.entropy), "%", "dispersione della varianza"),
  ].join("");
  document.getElementById("screeChart").innerHTML = renderScree(pca.eigenvalues, pca.explained);
  document.getElementById("factorMap").innerHTML = renderFactorMap(pca);
  document.getElementById("loadingsTable").innerHTML = renderLoadingsTable(pca);
}

function renderScree(eigenvalues, explained) {
  const shown = eigenvalues.slice(0, Math.min(8, eigenvalues.length));
  if (!shown.length) return '<p class="muted small">Dati insufficienti per la PCA.</p>';
  const width = 470;
  const height = 235;
  const left = 42;
  const bottom = 32;
  const top = 15;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - 15;
  const max = Math.max(1, ...shown);
  const step = plotWidth / Math.max(1, shown.length);
  const points = shown.map((value, index) => ({
    x: left + step * index + step / 2,
    y: top + plotHeight - (value / max) * plotHeight,
    value,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Scree plot degli autovalori">
      <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" stroke="#d9dfdb" />
      <line x1="${left}" y1="${height - bottom}" x2="${width - 15}" y2="${height - bottom}" stroke="#d9dfdb" />
      <polyline points="${line}" fill="none" stroke="#23675f" stroke-width="2.5" />
      ${points.map((point, index) => `
        <circle cx="${point.x}" cy="${point.y}" r="4" fill="#23675f" />
        <text x="${point.x}" y="${height - 13}" text-anchor="middle" font-size="10" fill="#6e7c79">C${index + 1}</text>
        <text x="${point.x}" y="${point.y - 10}" text-anchor="middle" font-size="9" fill="#6e7c79">${fmt(explained[index] || 0)}%</text>`).join("")}
    </svg>`;
}

function renderFactorMap(pca) {
  if (!pca.scores.length) return '<p class="muted small">Dati insufficienti per la mappa.</p>';
  const width = 620;
  const height = 280;
  const padding = 36;
  const xs = pca.scores.map((row) => row[0] || 0);
  const ys = pca.scores.map((row) => row[1] || 0);
  const maxX = Math.max(1, ...xs.map(Math.abs));
  const maxY = Math.max(1, ...ys.map(Math.abs));
  const xScale = (value) => width / 2 + (value / maxX) * (width / 2 - padding - 32);
  const yScale = (value) => height / 2 - (value / maxY) * (height / 2 - padding);
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mappa PCA degli elementi">
      <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" stroke="#d8dfdc" stroke-dasharray="3 4" />
      <line x1="${width / 2}" y1="${padding - 12}" x2="${width / 2}" y2="${height - padding + 8}" stroke="#d8dfdc" stroke-dasharray="3 4" />
      <text x="${width - padding}" y="${height / 2 - 7}" text-anchor="end" font-size="11" fill="#6e7c79">C1 · ${fmt(pca.explained[0] || 0)}%</text>
      <text x="${width / 2 + 7}" y="${padding - 13}" font-size="11" fill="#6e7c79">C2 · ${fmt(pca.explained[1] || 0)}%</text>
      ${pca.scores.map((score, index) => `
        <circle cx="${xScale(score[0] || 0)}" cy="${yScale(score[1] || 0)}" r="5" fill="#d39152" stroke="#fff" stroke-width="2">
          <title>${escapeHtml(state.elements[index])}: C1 ${fmtSmart(score[0] || 0)}, C2 ${fmtSmart(score[1] || 0)}</title>
        </circle>
        <text x="${xScale(score[0] || 0) + 8}" y="${yScale(score[1] || 0) - 6}" font-size="11" fill="#415b58">${escapeHtml(shorten(state.elements[index], 18))}</text>`).join("")}
    </svg>`;
}

function renderLoadingsTable(pca) {
  const shownCount = Math.min(4, pca.eigenvalues.length);
  if (!shownCount) return "<tbody><tr><td>Dati insufficienti.</td></tr></tbody>";
  const componentIndexes = Array.from({ length: shownCount }, (_, index) => index);
  return `
    <thead><tr><th>Costrutto</th>${componentIndexes.map((index) => `<th>C${index + 1}<br /><span class="muted">${fmt(pca.explained[index] || 0)}%</span></th>`).join("")}<th>Comunalità C1–C2</th></tr></thead>
    <tbody>
      ${state.constructs.map((construct, row) => {
        const rowVariance = variance(construct.values, true);
        const communality = rowVariance
          ? (((pca.loadings[row]?.[0] || 0) ** 2 + (pca.loadings[row]?.[1] || 0) ** 2) / rowVariance) * 100
          : 0;
        return `<tr>
          <td>${escapeHtml(shorten(`${construct.left} ↔ ${construct.right}`, 35))}</td>
          ${componentIndexes.map((index) => `<td>${fmtSmart(pca.loadings[row]?.[index] || 0)}</td>`).join("")}
          <td>${fmt(communality)}%</td>
        </tr>`;
      }).join("")}
    </tbody>`;
}

function hierarchicalCluster(vectors, linkage = "average") {
  const clusters = vectors.map((vector, index) => ({ leaf: index, members: [index], height: 0, vector }));
  const baseDistances = vectors.map((vectorA) => vectors.map((vectorB) => euclidean(vectorA, vectorB)));
  const clusterDistance = (clusterA, clusterB) => {
    const distances = clusterA.members.flatMap((first) => clusterB.members.map((second) => baseDistances[first][second]));
    if (linkage === "complete") return Math.max(...distances);
    if (linkage === "single") return Math.min(...distances);
    return mean(distances);
  };
  while (clusters.length > 1) {
    let best = { first: 0, second: 1, distance: clusterDistance(clusters[0], clusters[1]) };
    for (let first = 0; first < clusters.length; first += 1) {
      for (let second = first + 1; second < clusters.length; second += 1) {
        const distance = clusterDistance(clusters[first], clusters[second]);
        if (distance < best.distance) best = { first, second, distance };
      }
    }
    const left = clusters[best.first];
    const right = clusters[best.second];
    const merged = {
      left,
      right,
      members: [...left.members, ...right.members],
      height: best.distance,
    };
    clusters.splice(best.second, 1);
    clusters.splice(best.first, 1);
    clusters.push(merged);
  }
  return clusters[0];
}

function renderClusters() {
  const scope = document.getElementById("clusterScope").value;
  const linkage = document.getElementById("clusterLinkage").value;
  const vectors = getVectors(scope);
  const labels = getLabels(scope);
  document.getElementById("dendrogramTitle").textContent =
    scope === "elements" ? "Raggruppamento degli elementi" : "Raggruppamento dei costrutti";
  document.getElementById("dendrogram").innerHTML =
    vectors.length > 1 ? renderDendrogram(hierarchicalCluster(vectors, linkage), labels) : '<p class="muted small">Servono almeno due oggetti.</p>';
  const distanceMatrix = vectors.map((vectorA) => vectors.map((vectorB) => euclidean(vectorA, vectorB)));
  document.getElementById("distanceTable").innerHTML = renderMatrixTable(labels, distanceMatrix, "number");
}

function buildDendrogramModel(root, labels, options = {}) {
  const leaves = [];
  const collectLeaves = (node) => {
    if (node.leaf !== undefined) leaves.push(node);
    else {
      collectLeaves(node.left);
      collectLeaves(node.right);
    }
  };
  collectLeaves(root);
  const width = options.width || 850;
  const rowHeight = options.rowHeight || 38;
  const top = options.top || 24;
  const labelWidth = options.labelWidth || 185;
  const right = options.right || 30;
  const height = Math.max(170, leaves.length * rowHeight + 46);
  const maxHeight = root.height || 1;
  const leafY = new Map(leaves.map((leaf, index) => [leaf.leaf, top + index * rowHeight + 10]));
  const xFor = (node) => labelWidth + (node.height / maxHeight) * (width - labelWidth - right);
  const drawNode = (node) => {
    if (node.leaf !== undefined) {
      return { x: labelWidth, y: leafY.get(node.leaf), segments: [], labels: [] };
    }
    const left = drawNode(node.left);
    const rightNode = drawNode(node.right);
    const x = xFor(node);
    const y = (left.y + rightNode.y) / 2;
    return {
      x,
      y,
      segments: [
        ...left.segments,
        ...rightNode.segments,
        { x1: left.x, y1: left.y, x2: x, y2: left.y },
        { x1: rightNode.x, y1: rightNode.y, x2: x, y2: rightNode.y },
        { x1: x, y1: left.y, x2: x, y2: rightNode.y },
      ],
      labels: [
        ...left.labels,
        ...rightNode.labels,
        { x: x + 4, y: y - 5, text: fmtSmart(node.height, 1), kind: "distance" },
      ],
    };
  };
  const tree = drawNode(root);
  return {
    width,
    height,
    labelWidth,
    right,
    maxHeight,
    leaves: leaves.map((leaf) => ({
      index: leaf.leaf,
      label: labels[leaf.leaf],
      y: leafY.get(leaf.leaf),
    })),
    segments: tree.segments,
    labels: tree.labels,
  };
}

function renderDendrogramSvg(model) {
  return `
    <svg viewBox="0 0 ${model.width} ${model.height}" width="${model.width}" height="${model.height}" role="img" aria-label="Dendrogramma gerarchico">
      ${model.leaves.map((leaf) => `
        <text x="3" y="${leaf.y + 4}" font-size="11" fill="#48625f">${escapeHtml(shorten(leaf.label, 29))}</text>
        <circle cx="${model.labelWidth}" cy="${leaf.y}" r="3" fill="#d39152" />`).join("")}
      ${model.segments.map((segment) => `
        <line x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" stroke="#4f7772" stroke-width="1.7" />`).join("")}
      ${model.labels.map((label) => `
        <text x="${label.x}" y="${label.y}" font-size="9" fill="#9a6a3c">${escapeHtml(label.text)}</text>`).join("")}
      <text x="${model.labelWidth}" y="${model.height - 10}" font-size="10" fill="#6e7c79">0</text>
      <text x="${model.width - model.right}" y="${model.height - 10}" text-anchor="end" font-size="10" fill="#6e7c79">${fmtSmart(model.maxHeight, 1)} distanza</text>
    </svg>`;
}

function renderDendrogram(root, labels) {
  return renderDendrogramSvg(buildDendrogramModel(root, labels));
}

function fileNamePart(value) {
  return String(value || "griglia")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "griglia";
}

function svgToJpegBlob(svg, scale = 2) {
  return new Promise((resolve, reject) => {
    const viewBox = svg.viewBox.baseVal;
    const width = Math.max(1, viewBox.width || Number(svg.getAttribute("width")) || 840);
    const height = Math.max(1, viewBox.height || Number(svg.getAttribute("height")) || 340);
    let source = new XMLSerializer().serializeToString(svg);
    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
      source = source.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const svgUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Conversione JPG non riuscita."));
      }, "image/jpeg", 0.95);
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("Immagine del grafico non disponibile."));
    };
    image.src = svgUrl;
  });
}

function openPanelWindow(selector, title) {
  const source = document.querySelector(selector);
  if (!source) {
    showToast(`${title} non disponibile.`, "error");
    return;
  }
  const stylesheetText = Array.from(document.styleSheets).flatMap((sheet) => {
    try {
      return Array.from(sheet.cssRules, (rule) => rule.cssText);
    } catch {
      return [];
    }
  }).join("\n");
  const contentClasses = escapeHtml(Array.from(source.classList).join(" "));
  const popupHtml = `<!doctype html>
    <html lang="it">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)} · Griglia PCP</title>
        <style>${stylesheetText}
          body { min-width: 0; margin: 0; padding: 24px; background: #f1eee5; }
          .popup-shell { max-width: 1440px; margin: 0 auto; padding: 24px; border: 1px solid #d9dfd8; border-radius: 16px; background: #fffefa; box-shadow: 0 18px 50px rgba(35, 55, 50, 0.12); }
          .popup-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
          .popup-heading h1 { margin: 0; color: #20302f; font-family: Georgia, serif; font-size: clamp(25px, 4vw, 38px); font-weight: 500; }
          .popup-kicker { margin: 0 0 6px; color: #34766e; font-size: 12px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
          .popup-content { min-width: 0; }
          .popup-content.chart-wrap { min-height: 0; overflow: visible; }
          .popup-content.chart-wrap svg { width: auto; max-width: none !important; height: auto; }
          .popup-content table { width: 100%; }
          .popup-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
          @media (max-width: 700px) { body { padding: 10px; } .popup-shell { padding: 15px; } .popup-heading { display: block; } .popup-heading button { margin-top: 12px; } }
        </style>
      </head>
      <body>
        <main class="popup-shell">
          <div class="popup-heading">
            <div><p class="popup-kicker">Visualizzazione separata</p><h1>${escapeHtml(title)}</h1></div>
            <div class="popup-actions">
              <button class="secondary-button" type="button" id="popupJpgBtn">Scarica JPG</button>
              <button class="secondary-button" type="button" onclick="window.print()">Stampa / PDF</button>
            </div>
          </div>
          <div class="popup-content ${contentClasses}">${source.innerHTML}</div>
        </main>
      </body>
      <script>
        function popupDownload(name, blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = name;
          document.body.append(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        function popupSvgToJpeg(svg, scale) {
          return new Promise((resolve, reject) => {
            const values = (svg.getAttribute("viewBox") || "0 0 840 340").split(/\\s+/).map(Number);
            const width = Math.max(1, values[2] || Number(svg.getAttribute("width")) || 840);
            const height = Math.max(1, values[3] || Number(svg.getAttribute("height")) || 340);
            let source = new XMLSerializer().serializeToString(svg);
            if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) source = source.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
            const url = URL.createObjectURL(new Blob([source], {type: "image/svg+xml;charset=utf-8"}));
            const image = new Image();
            image.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = Math.ceil(width * scale);
              canvas.height = Math.ceil(height * scale);
              const context = canvas.getContext("2d");
              context.fillStyle = "#ffffff";
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);
              canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Conversione JPG non riuscita.")), "image/jpeg", 0.95);
            };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine del riquadro non disponibile.")); };
            image.src = url;
          });
        }

        async function popupHtmlToJpeg(content, scale) {
          const rect = content.getBoundingClientRect();
          const width = Math.ceil(Math.max(720, content.scrollWidth, rect.width));
          const height = Math.ceil(Math.max(160, content.scrollHeight, rect.height));
          const css = Array.from(document.styleSheets).flatMap((sheet) => {
            try { return Array.from(sheet.cssRules, (rule) => rule.cssText); } catch { return []; }
          }).join("\\n").replaceAll("</style", "<\\/style");
          const markup = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:' + width + 'px;min-height:' + height + 'px;box-sizing:border-box;padding:24px;background:#fffefa;"><style>' + css + '</style>' + content.innerHTML + '</div></foreignObject></svg>';
          return popupSvgToJpeg(new DOMParser().parseFromString(markup, "image/svg+xml").documentElement, scale);
        }

        document.getElementById("popupJpgBtn").addEventListener("click", async () => {
          const content = document.querySelector(".popup-content");
          const svg = content.querySelector("svg");
          try {
            const blob = svg ? await popupSvgToJpeg(svg, 2) : await popupHtmlToJpeg(content, 2);
            popupDownload("${fileNamePart(title)}-${fileNamePart(state.name)}.jpg", blob);
          } catch (error) {
            window.alert(error.message || "Esportazione JPG non riuscita.");
          }
        });
      </script>
    </html>`;
  const popupUrl = URL.createObjectURL(new Blob([popupHtml], { type: "text/html;charset=utf-8" }));
  const popup = window.open(popupUrl, "_blank", "popup,width=1180,height=820,resizable=yes,scrollbars=yes");
  if (!popup) {
    URL.revokeObjectURL(popupUrl);
    showToast("La finestra separata è stata bloccata dal browser.", "error");
    return;
  }
  function writePopupFallback() {
    try {
      if (popup.closed || popup.document.getElementById("popupJpgBtn")) return;
      popup.document.open();
      popup.document.write(popupHtml);
      popup.document.close();
    } catch {
      // A cross-origin popup is already navigating to the Blob document.
    }
  }
  window.setTimeout(writePopupFallback, 900);
  window.setTimeout(() => URL.revokeObjectURL(popupUrl), 60000);
  popup.focus();
}

async function exportChartJpg(containerSelector, fileStem, chartName) {
  const svg = document.querySelector(`${containerSelector} svg`);
  if (!svg) {
    showToast(`${chartName} non disponibile.`, "error");
    return;
  }
  try {
    const blob = await svgToJpegBlob(svg);
    downloadBlob(`${fileStem}-${fileNamePart(state.name)}.jpg`, blob);
    showToast(`${chartName} JPG scaricato.`);
  } catch (error) {
    showToast(error.message || "Esportazione JPG non riuscita.", "error");
  }
}

async function exportCurrentDendrogramJpg() {
  const svg = document.querySelector("#dendrogram svg");
  if (!svg) {
    showToast("Dendrogramma non disponibile.", "error");
    return;
  }
  const scope = document.getElementById("clusterScope").value;
  const scopeName = scope === "elements" ? "elementi" : "costrutti";
  try {
    const blob = await svgToJpegBlob(svg);
    downloadBlob(`dendrogramma-${scopeName}-${fileNamePart(state.name)}.jpg`, blob);
    showToast("Dendrogramma JPG scaricato.");
  } catch (error) {
    showToast(error.message || "Esportazione JPG non riuscita.", "error");
  }
}

function renderAll() {
  const analysis = calculateAnalysis();
  renderDashboard(analysis);
  renderGridEditor();
  renderCorrelations(analysis);
  renderDynamics(calculateDynamics(analysis));
  renderFactors(analysis);
  renderClusters();
  saveState();
}

function setView(view) {
  if (!VIEW_META[view]) return;
  activeView = view;
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  document.getElementById(`${view}View`).classList.add("active");
  document.getElementById("viewEyebrow").textContent = VIEW_META[view][0];
  document.getElementById("viewTitle").textContent = VIEW_META[view][1];
}

function showToast(message, type = "") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast visible ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 2800);
}

function addElement() {
  state.elements.push(`Elemento ${state.elements.length + 1}`);
  state.constructs.forEach((construct) => construct.values.push(state.scale.min));
  renderAll();
  showToast("Elemento aggiunto.");
}

function addConstruct() {
  state.constructs.push({
    left: `Polo sinistro ${state.constructs.length + 1}`,
    right: `Polo destro ${state.constructs.length + 1}`,
    values: state.elements.map(() => state.scale.min),
  });
  renderAll();
  showToast("Costrutto aggiunto.");
}

function updateScale() {
  const min = safeNumber(document.getElementById("scaleMin").value, state.scale.min);
  const max = safeNumber(document.getElementById("scaleMax").value, state.scale.max);
  if (max <= min) {
    showToast("Il valore massimo della scala deve superare il minimo.", "error");
    renderGridEditor();
    return;
  }
  state.scale = { min, max };
  state.constructs.forEach((construct) => {
    construct.values = construct.values.map((value) => clamp(value, min, max));
  });
  renderAll();
  showToast("Scala aggiornata.");
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const separator = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function gridFromCsv(text, fileName = "Griglia importata") {
  const rows = parseCsv(text);
  if (rows.length < 2 || rows[0].length < 4) {
    throw new Error("Il CSV deve includere almeno due elementi e un costrutto.");
  }
  const elements = rows[0].slice(2).filter(Boolean);
  if (elements.length < 2) throw new Error("Servono almeno due elementi.");
  const constructs = rows.slice(1).map((row, rowIndex) => {
    const values = elements.map((_, colIndex) => safeNumber(row[colIndex + 2], Number.NaN));
    if (values.some((value) => !Number.isFinite(value))) {
      throw new Error(`Punteggio non valido nella riga ${rowIndex + 2}.`);
    }
    return {
      left: row[0] || `Polo sinistro ${rowIndex + 1}`,
      right: row[1] || `Polo destro ${rowIndex + 1}`,
      values,
    };
  });
  const allValues = constructs.flatMap((construct) => construct.values);
  const inferredMin = Math.min(...allValues);
  const inferredMax = Math.max(...allValues);
  return normalizeGrid({
    name: fileName.replace(/\.[^.]+$/, ""),
    scale: {
      min: inferredMin >= 1 && inferredMax <= 7 ? 1 : inferredMin,
      max: inferredMin >= 1 && inferredMax <= 7 ? 7 : inferredMax,
    },
    elements,
    constructs,
  });
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result);
      state = file.name.toLowerCase().endsWith(".json")
        ? normalizeGrid(JSON.parse(text))
        : gridFromCsv(text, file.name);
      renderAll();
      setView("dashboard");
      showToast(`Importazione completata: ${file.name}`);
    } catch (error) {
      showToast(`Importazione non riuscita: ${error.message}`, "error");
    }
  };
  reader.readAsText(file);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",;\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadText(fileName, content, type) {
  downloadBlob(fileName, new Blob([content], { type }));
}

function stateToCsv(grid) {
  const rows = [
    ["polo_sinistro", "polo_destro", ...grid.elements],
    ...grid.constructs.map((construct) => [construct.left, construct.right, ...construct.values]),
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function reportConstructLabel(index) {
  const construct = state.constructs[index];
  return `${construct.left} ↔ ${construct.right}`;
}

function buildReportDendrogram(scope) {
  const vectors = getVectors(scope);
  const labels = getLabels(scope);
  if (vectors.length < 2) return null;
  return {
    title: scope === "elements" ? "Dendrogramma degli elementi" : "Dendrogramma dei costrutti",
    model: buildDendrogramModel(hierarchicalCluster(vectors, "average"), labels, {
      width: 760,
      rowHeight: 34,
      labelWidth: scope === "elements" ? 150 : 210,
      right: 24,
    }),
  };
}

function reportTable(headers, rows) {
  return `<table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

function buildReportContext() {
  const analysis = calculateAnalysis();
  const dynamics = calculateDynamics(analysis);
  const strongCorrelations = [...analysis.pairCorrelations]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 10);
  const centralConstructs = [...dynamics.constructProfiles]
    .sort((a, b) => b.centrality - a.centrality)
    .slice(0, 10);
  const readiness = [...dynamics.constructProfiles]
    .sort((a, b) => b.mesi - a.mesi)
    .slice(0, 10);
  const selectivePolarization = [...dynamics.constructProfiles]
    .sort((a, b) => b.spi - a.spi)
    .slice(0, 10);
  const reportDendrograms = [buildReportDendrogram("elements"), buildReportDendrogram("constructs")].filter(Boolean);
  return {
    analysis,
    dynamics,
    generatedAt: new Date().toLocaleString("it-IT"),
    strongCorrelations,
    centralConstructs,
    readiness,
    selectivePolarization,
    reportDendrograms,
  };
}

function buildWordReport() {
  const ctx = buildReportContext();
  const pcaTwo = (ctx.analysis.pca.explained[0] || 0) + (ctx.analysis.pca.explained[1] || 0);
  const safeCorridor = ctx.dynamics.safeChangeCorridor === null ? "non calcolabile" : `${fmt(ctx.dynamics.safeChangeCorridor)}%`;
  const selfIdeal = ctx.dynamics.selfGeometry.selfIdeal
    ? `${fmt(ctx.dynamics.selfGeometry.selfIdeal.proximity)}%`
    : "non calcolabile";
  const coreRows = [
    ["Griglia", state.name],
    ["Generato il", ctx.generatedAt],
    ["Elementi", String(state.elements.length)],
    ["Costrutti", String(state.constructs.length)],
    ["Scala", `${state.scale.min}–${state.scale.max}`],
    ["Media rating", fmt(ctx.analysis.average)],
    ["Deviazione standard", fmt(ctx.analysis.standardDeviation)],
    ["Polarizzazione globale", `${fmt(ctx.analysis.polarization)}%`],
    ["Uso del punto medio", `${fmt(ctx.analysis.midpointUse)}%`],
    ["Differenziazione di Bieri", `${fmt(ctx.analysis.bieriDifferentiation)}%`],
    ["Intensità correlazionale", `${fmt(ctx.analysis.intensity)}%`],
    ["PCA C1", `${fmt(ctx.analysis.pca.explained[0] || 0)}%`],
    ["PCA C1+C2", `${fmt(pcaTwo)}%`],
  ];
  const dynamicsRows = [
    ["Construct System Entropy", `${fmt(ctx.dynamics.cse)}%`],
    ["Construct Redundancy Compression Index C1", `${fmt(ctx.dynamics.crci1)}%`],
    ["Construct Redundancy Compression Index C1+C2", `${fmt(ctx.dynamics.crci2)}%`],
    ["Construct Orthogonality Index", `${fmt(ctx.dynamics.coi)}%`],
    ["Construct Load Concentration Index", `${fmt(ctx.dynamics.clci)}%`],
    ["Implicative Dilemma Density", `${fmt(ctx.dynamics.dilemmaDensity)}%`],
    ["Safe Change Corridor Index", safeCorridor],
    ["Self-Ideal Congruence", selfIdeal],
  ];
  const correlationRows = ctx.strongCorrelations.map((item) => [
    reportConstructLabel(item.first),
    reportConstructLabel(item.second),
    fmtSmart(item.value),
  ]);
  const centralityRows = ctx.centralConstructs.map((profile) => [
    reportConstructLabel(profile.index),
    `${fmt(profile.centrality * 100)}%`,
    `${fmt(profile.bridge * 100)}%`,
    `${fmt(profile.fragility * 100)}%`,
    `${fmt(profile.instability * 100)}%`,
  ]);
  const readinessRows = ctx.readiness.map((profile) => [
    reportConstructLabel(profile.index),
    `${fmt(profile.cpp * 100)}%`,
    `${fmt(profile.ctr * 100)}%`,
    `${fmt(profile.mesi * 100)}%`,
    profile.direction,
  ]);
  const changeCostRows = ctx.dynamics.changeCosts.length
    ? ctx.dynamics.changeCosts.map((entry) => [
      reportConstructLabel(entry.index),
      entry.direction,
      `${fmt(entry.benefit * 100)}%`,
      `${fmt(entry.risk * 100)}%`,
      `${fmt(entry.safety * 100)}%`,
    ])
    : [["Nessun costrutto discrepante o ruoli sé/ideale non disponibili", "", "", "", ""]];
  const selectiveRows = ctx.selectivePolarization.map((profile) => [
    reportConstructLabel(profile.index),
    `${fmt(profile.spi * 100)}%`,
    `${fmt(profile.differentiation * 100)}%`,
    `${fmt(profile.redundancy * 100)}%`,
  ]);

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Report Griglia PCP</title>
        <style>
          body { font-family: Arial, sans-serif; color: #20302f; line-height: 1.45; }
          h1, h2 { color: #184e49; }
          h1 { font-size: 26px; }
          h2 { margin-top: 28px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
          th, td { border: 1px solid #cfd5cf; padding: 7px 8px; font-size: 11px; vertical-align: top; }
          th { background: #dcece7; text-align: left; }
          .note { color: #6e7c79; font-size: 11px; }
          .dendrogram svg { max-width: 100%; height: auto; border: 1px solid #e3e3dc; margin: 8px 0 18px; }
        </style>
      </head>
      <body>
        <h1>Report analisi Griglia PCP</h1>
        <p class="note">Report generato localmente dal browser. Gli indici RG Dynamics sono operazionalizzazioni quantitative sperimentali.</p>
        <h2>Sintesi descrittiva</h2>
        ${reportTable(["Indicatore", "Valore"], coreRows)}
        <h2>RG Dynamics</h2>
        ${reportTable(["Indicatore", "Valore"], dynamicsRows)}
        <h2>Correlazioni più forti tra costrutti</h2>
        ${reportTable(["Costrutto A", "Costrutto B", "r"], correlationRows)}
        <h2>Centralità, bridge, fragilità e instabilità</h2>
        ${reportTable(["Costrutto", "Centralità", "Bridge", "Fragilità", "Instabilità"], centralityRows)}
        <h2>Costo del cambiamento</h2>
        ${reportTable(["Costrutto", "Direzione", "Beneficio", "Rischio", "Sicurezza"], changeCostRows)}
        <h2>Readiness e micro-esperimenti</h2>
        ${reportTable(["Costrutto", "CPP", "CTR", "MESI", "Target"], readinessRows)}
        <h2>Polarizzazione selettiva</h2>
        ${reportTable(["Costrutto", "SPI", "Differenziazione", "Ridondanza"], selectiveRows)}
        <h2>Dendrogrammi</h2>
        ${ctx.reportDendrograms.map((item) => `
          <h3>${escapeHtml(item.title)}</h3>
          <div class="dendrogram">${renderDendrogramSvg(item.model)}</div>
        `).join("")}
      </body>
    </html>`;
}

function asciiReportText(value) {
  return String(value ?? "")
    .replaceAll("↔", "<->")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("×", "x")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function wrapReportLine(text, width = 94) {
  const clean = asciiReportText(text);
  const words = clean.split(/\s+/);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    if (!word) return;
    if ((current + " " + word).trim().length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function buildReportLines(ctx = buildReportContext()) {
  const lines = [];
  const add = (text = "") => lines.push(...wrapReportLine(text));
  const section = (title) => {
    lines.push("");
    add(title.toUpperCase());
    lines.push("-".repeat(Math.min(72, title.length + 8)));
  };
  const pcaTwo = (ctx.analysis.pca.explained[0] || 0) + (ctx.analysis.pca.explained[1] || 0);
  add("Report analisi Griglia PCP");
  add(`Griglia: ${state.name}`);
  add(`Generato il: ${ctx.generatedAt}`);
  add(`Elementi: ${state.elements.length} | Costrutti: ${state.constructs.length} | Scala: ${state.scale.min}-${state.scale.max}`);
  section("Sintesi descrittiva");
  [
    `Media rating: ${fmt(ctx.analysis.average)}`,
    `Deviazione standard: ${fmt(ctx.analysis.standardDeviation)}`,
    `Polarizzazione globale: ${fmt(ctx.analysis.polarization)}%`,
    `Uso del punto medio: ${fmt(ctx.analysis.midpointUse)}%`,
    `Differenziazione di Bieri: ${fmt(ctx.analysis.bieriDifferentiation)}%`,
    `Intensita correlazionale: ${fmt(ctx.analysis.intensity)}%`,
    `PCA C1: ${fmt(ctx.analysis.pca.explained[0] || 0)}% | PCA C1+C2: ${fmt(pcaTwo)}%`,
  ].forEach(add);
  section("RG Dynamics");
  [
    `CSE: ${fmt(ctx.dynamics.cse)}%`,
    `CRCI C1: ${fmt(ctx.dynamics.crci1)}% | CRCI C1+C2: ${fmt(ctx.dynamics.crci2)}%`,
    `COI: ${fmt(ctx.dynamics.coi)}% | CLCI: ${fmt(ctx.dynamics.clci)}%`,
    `IDD: ${fmt(ctx.dynamics.dilemmaDensity)}%`,
    `SCCI: ${ctx.dynamics.safeChangeCorridor === null ? "non calcolabile" : `${fmt(ctx.dynamics.safeChangeCorridor)}%`}`,
  ].forEach(add);
  if (ctx.dynamics.selfGeometry.selfIdeal) {
    add(`Self-Ideal Congruence: ${fmt(ctx.dynamics.selfGeometry.selfIdeal.proximity)}%`);
  }
  section("Correlazioni piu forti");
  ctx.strongCorrelations.forEach((item, index) => {
    add(`${index + 1}. ${reportConstructLabel(item.first)} / ${reportConstructLabel(item.second)}: r=${fmtSmart(item.value)}`);
  });
  section("Centralita e fragilita");
  ctx.centralConstructs.forEach((profile, index) => {
    add(`${index + 1}. ${reportConstructLabel(profile.index)} | centralita ${fmt(profile.centrality * 100)}% | bridge ${fmt(profile.bridge * 100)}% | fragilita ${fmt(profile.fragility * 100)}% | instabilita ${fmt(profile.instability * 100)}%`);
  });
  section("Costo del cambiamento");
  if (ctx.dynamics.changeCosts.length) {
    ctx.dynamics.changeCosts.forEach((entry, index) => {
      add(`${index + 1}. ${reportConstructLabel(entry.index)} | ${entry.direction} | beneficio ${fmt(entry.benefit * 100)}% | rischio ${fmt(entry.risk * 100)}% | sicurezza ${fmt(entry.safety * 100)}%`);
    });
  } else {
    add("Nessun costrutto discrepante o ruoli se/ideale non disponibili.");
  }
  section("Readiness e micro-esperimenti");
  ctx.readiness.forEach((profile, index) => {
    add(`${index + 1}. ${reportConstructLabel(profile.index)} | CPP ${fmt(profile.cpp * 100)}% | CTR ${fmt(profile.ctr * 100)}% | MESI ${fmt(profile.mesi * 100)}% | ${profile.direction}`);
  });
  return lines;
}

function pdfEscape(text) {
  return asciiReportText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfTextCommand(text, x, y, size = 8) {
  return `BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`;
}

function buildPdfDendrogramStream(item) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const titleY = pageHeight - margin;
  const topOffset = 44;
  const model = item.model;
  const scale = Math.min(
    (pageWidth - margin * 2) / model.width,
    (pageHeight - margin * 2 - topOffset) / model.height,
  );
  const originX = margin;
  const originY = pageHeight - margin - topOffset;
  const x = (value) => originX + value * scale;
  const y = (value) => originY - value * scale;
  const commands = [
    pdfTextCommand(item.title, margin, titleY, 14),
    pdfTextCommand(`Legame medio - distanza massima ${fmtSmart(model.maxHeight, 1)}`, margin, titleY - 18, 8),
    "0.31 0.47 0.45 RG 1.15 w",
    ...model.segments.map((segment) =>
      `${x(segment.x1).toFixed(2)} ${y(segment.y1).toFixed(2)} m ${x(segment.x2).toFixed(2)} ${y(segment.y2).toFixed(2)} l S`,
    ),
    "0.82 0.55 0.30 rg",
    ...model.leaves.map((leaf) => {
      const px = x(model.labelWidth);
      const py = y(leaf.y);
      return `${(px - 1.7).toFixed(2)} ${(py - 1.7).toFixed(2)} 3.4 3.4 re f`;
    }),
    "0 0 0 rg",
    ...model.leaves.map((leaf) => pdfTextCommand(shorten(leaf.label, 38), originX, y(leaf.y) - 2, 7.5)),
    ...model.labels.map((label) => pdfTextCommand(label.text, x(label.x), y(label.y), 6.5)),
    pdfTextCommand("0", x(model.labelWidth), pageHeight - margin - topOffset - model.height * scale - 12, 7),
    pdfTextCommand(`${fmtSmart(model.maxHeight, 1)} distanza`, x(model.width - model.right) - 48, pageHeight - margin - topOffset - model.height * scale - 12, 7),
  ];
  return commands.join("\n");
}

function buildPdfBlob() {
  const ctx = buildReportContext();
  const wrappedLines = buildReportLines(ctx);
  const pageHeight = 842;
  const margin = 48;
  const leading = 15;
  const maxLines = Math.floor((pageHeight - margin * 2) / leading);
  const pages = [];
  for (let index = 0; index < wrappedLines.length; index += maxLines) {
    pages.push(wrappedLines.slice(index, index + maxLines));
  }

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  pages.forEach((pageLines) => {
    const stream = `BT /F1 10 Tf ${margin} ${pageHeight - margin} Td ${leading} TL\n${
      pageLines.map((line) => `(${pdfEscape(line)}) Tj T*`).join("\n")
    }\nET`;
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  ctx.reportDendrograms.forEach((item) => {
    const stream = buildPdfDendrogramStream(item);
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewTarget));
  });
  document.getElementById("addElementBtn").addEventListener("click", addElement);
  document.getElementById("addConstructBtn").addEventListener("click", addConstruct);
  const bindGridNameInput = (input) => {
    input.addEventListener("change", () => {
      state.name = input.value.trim() || "Griglia senza titolo";
      renderAll();
      showToast("Nome della griglia aggiornato.");
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
    });
  };
  bindGridNameInput(document.getElementById("dashboardGridNameInput"));
  bindGridNameInput(document.getElementById("gridNameInput"));
  document.getElementById("scaleMin").addEventListener("change", updateScale);
  document.getElementById("scaleMax").addEventListener("change", updateScale);
  document.getElementById("correlationScope").addEventListener("change", () => renderCorrelations(calculateAnalysis()));
  document.getElementById("clusterScope").addEventListener("change", renderClusters);
  document.getElementById("clusterLinkage").addEventListener("change", renderClusters);
  document.getElementById("openIndicatorsBtn").addEventListener("click", () => openPanelWindow("#indicatorList", "Profilo strutturale"));
  document.getElementById("openScaleDistributionBtn").addEventListener("click", () => openPanelWindow("#scaleDistribution", "Uso della scala"));
  document.getElementById("openDashboardHeatmapBtn").addEventListener("click", () => openPanelWindow("#dashboardHeatmap", "Correlazioni tra costrutti"));
  document.getElementById("openInsightsBtn").addEventListener("click", () => openPanelWindow("#insightList", "In evidenza"));
  document.getElementById("openCorrelationHeatmapBtn").addEventListener("click", () => openPanelWindow("#correlationHeatmap", "Heatmap delle correlazioni"));
  document.getElementById("openCorrelationHighlightsBtn").addEventListener("click", () => openPanelWindow("#correlationHighlights", "Associazioni più forti"));
  document.getElementById("openCorrelationTableBtn").addEventListener("click", () => openPanelWindow("#correlationTable", "Matrice completa"));
  document.getElementById("openScreeBtn").addEventListener("click", () => openPanelWindow("#screeChart", "Scree plot degli autovalori"));
  document.getElementById("openFactorMapBtn").addEventListener("click", () => openPanelWindow("#factorMap", "Mappa degli elementi"));
  document.getElementById("openDendrogramBtn").addEventListener("click", () => openPanelWindow("#dendrogram", "Dendrogramma"));
  document.getElementById("exportDashboardHeatmapJpgBtn").addEventListener("click", () => {
    exportChartJpg("#dashboardHeatmap", "heatmap-rapida", "Heatmap rapida");
  });
  document.getElementById("exportCorrelationHeatmapJpgBtn").addEventListener("click", () => {
    const scope = document.getElementById("correlationScope").value;
    const scopeName = scope === "elements" ? "elementi" : "costrutti";
    exportChartJpg("#correlationHeatmap", `heatmap-${scopeName}`, "Heatmap completa");
  });
  document.getElementById("exportScreeJpgBtn").addEventListener("click", () => {
    exportChartJpg("#screeChart", "autovalori", "Grafico degli autovalori");
  });
  document.getElementById("exportFactorMapJpgBtn").addEventListener("click", () => {
    exportChartJpg("#factorMap", "mappa-elementi", "Mappa degli elementi");
  });
  document.getElementById("exportDendrogramJpgBtn").addEventListener("click", exportCurrentDendrogramJpg);
  document.getElementById("gridEditorTable").addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.scoreRow !== undefined) {
      const row = Number(target.dataset.scoreRow);
      const col = Number(target.dataset.scoreCol);
      state.constructs[row].values[col] = clamp(safeNumber(target.value, state.scale.min), state.scale.min, state.scale.max);
    } else if (target.dataset.elementName !== undefined) {
      state.elements[Number(target.dataset.elementName)] = target.value || "Elemento";
    } else if (target.dataset.constructLeft !== undefined) {
      state.constructs[Number(target.dataset.constructLeft)].left = target.value || "Polo sinistro";
    } else if (target.dataset.constructRight !== undefined) {
      state.constructs[Number(target.dataset.constructRight)].right = target.value || "Polo destro";
    }
    renderAll();
  });
  document.getElementById("gridEditorTable").addEventListener("click", (event) => {
    const target = event.target;
    if (target.dataset.removeElement !== undefined) {
      const index = Number(target.dataset.removeElement);
      state.elements.splice(index, 1);
      state.constructs.forEach((construct) => construct.values.splice(index, 1));
      renderAll();
      showToast("Elemento rimosso.");
    }
    if (target.dataset.removeConstruct !== undefined) {
      state.constructs.splice(Number(target.dataset.removeConstruct), 1);
      renderAll();
      showToast("Costrutto rimosso.");
    }
  });
  document.getElementById("openImportBtn").addEventListener("click", () => setView("data"));
  const fileInput = document.getElementById("fileInput");
  fileInput.addEventListener("change", () => {
    handleFile(fileInput.files[0]);
    fileInput.value = "";
  });
  const dropZone = document.querySelector(".upload-zone");
  ["dragenter", "dragover"].forEach((type) => dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((type) => dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
  }));
  dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
  document.getElementById("exportJsonBtn").addEventListener("click", () => {
    downloadText("griglia-pcp-backup.json", JSON.stringify(state, null, 2), "application/json;charset=utf-8");
    showToast("Backup JSON esportato.");
  });
  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    downloadText("griglia-pcp.csv", stateToCsv(state), "text/csv;charset=utf-8");
    showToast("CSV esportato.");
  });
  document.getElementById("exportWordReportBtn").addEventListener("click", () => {
    downloadText("report-griglia-pcp.doc", buildWordReport(), "application/msword;charset=utf-8");
    showToast("Report Word scaricato.");
  });
  document.getElementById("exportPdfReportBtn").addEventListener("click", () => {
    downloadBlob("report-griglia-pcp.pdf", buildPdfBlob());
    showToast("Report PDF scaricato.");
  });
  document.getElementById("downloadTemplateBtn").addEventListener("click", () => {
    const template = [
      ["polo_sinistro", "polo_destro", "Elemento 1", "Elemento 2", "Elemento 3"],
      ["Accogliente", "Distante", 1, 4, 6],
      ["Flessibile", "Rigido", 2, 3, 7],
    ];
    downloadText("modello-griglia-pcp.csv", template.map((row) => row.map(csvEscape).join(",")).join("\n"), "text/csv;charset=utf-8");
    showToast("Modello CSV scaricato.");
  });
  const helpModal = document.getElementById("helpModal");
  document.getElementById("showHelpBtn").addEventListener("click", () => helpModal.classList.remove("hidden"));
  document.getElementById("closeHelpBtn").addEventListener("click", () => helpModal.classList.add("hidden"));
  helpModal.addEventListener("click", (event) => {
    if (event.target === helpModal) helpModal.classList.add("hidden");
  });
}

bindEvents();
renderAll();
setView(activeView);
