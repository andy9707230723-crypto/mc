const BIOMES = {
  cherry_grove: { label: "櫻花林", color: "#f9a8d4", rarity: 0.055 },
  mangrove_swamp: { label: "紅樹林沼澤", color: "#84cc16", rarity: 0.052 },
  ice_spikes: { label: "冰刺之地", color: "#93c5fd", rarity: 0.045 },
  badlands: { label: "惡地", color: "#f97316", rarity: 0.07 },
  jungle: { label: "叢林", color: "#22c55e", rarity: 0.08 },
  mushroom_fields: { label: "蘑菇島", color: "#c084fc", rarity: 0.028 },
  desert: { label: "沙漠", color: "#fde68a", rarity: 0.12 },
  snowy_plains: { label: "雪原", color: "#e0f2fe", rarity: 0.11 },
};

const form = document.querySelector("#scanForm");
const seedInput = document.querySelector("#seedInput");
const biomeSelect = document.querySelector("#biomeSelect");
const radiusSelect = document.querySelector("#radiusSelect");
const stepSelect = document.querySelector("#stepSelect");
const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const progressText = document.querySelector("#progressText");
const progressBar = document.querySelector("#progressBar");
const statusText = document.querySelector("#statusText");
const resultsBody = document.querySelector("#resultsBody");
const resultCount = document.querySelector("#resultCount");
const copyHint = document.querySelector("#copyHint");
const mapCanvas = document.querySelector("#mapCanvas");
const mapMeta = document.querySelector("#mapMeta");
const ctx = mapCanvas.getContext("2d");

let worker;
let results = [];
let activeScan = null;

drawMap([], 1000000, "cherry_grove");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  startScan();
});

stopButton.addEventListener("click", () => {
  if (worker) {
    worker.postMessage({ type: "stop" });
    statusText.textContent = "正在停止掃描...";
  }
});

resultsBody.addEventListener("click", async (event) => {
  const row = event.target.closest("tr");
  if (!row) return;

  const command = row.dataset.command;
  try {
    await copyText(command);
    copyHint.textContent = `已複製：${command}`;
  } catch {
    copyHint.textContent = "剪貼簿被瀏覽器阻擋，請手動複製該指令。";
  }
});

function startScan() {
  stopWorker();
  results = [];
  renderResults();

  const seed = seedInput.value.trim() || "0";
  const biome = biomeSelect.value;
  const radius = Number(radiusSelect.value);
  const step = Number(stepSelect.value);
  activeScan = { seed, biome, radius, step };

  setRunning(true);
  updateProgress(0);
  statusText.textContent = "掃描中...";
  mapMeta.textContent = `X/Z ±${radius.toLocaleString()}，步長 ${step.toLocaleString()}`;
  drawMap(results, radius, biome);

  worker = new Worker(URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" })));
  worker.onmessage = ({ data }) => {
    if (data.type === "batch") {
      results.push(...data.results);
      renderResults();
      drawMap(results, radius, biome);
      updateProgress(data.progress);
      statusText.textContent = `已檢查 ${data.checked.toLocaleString()} / ${data.total.toLocaleString()} 個點`;
      return;
    }

    if (data.type === "done") {
      updateProgress(100);
      statusText.textContent = `掃描完成，共找到 ${results.length.toLocaleString()} 個座標。`;
      setRunning(false);
      stopWorker();
      return;
    }

    if (data.type === "stopped") {
      statusText.textContent = `掃描已停止，保留目前 ${results.length.toLocaleString()} 個結果。`;
      setRunning(false);
      stopWorker();
    }
  };

  worker.postMessage({ type: "start", payload: activeScan, biomes: BIOMES });
}

function setRunning(isRunning) {
  startButton.disabled = isRunning;
  stopButton.disabled = !isRunning;
  seedInput.disabled = isRunning;
  biomeSelect.disabled = isRunning;
  radiusSelect.disabled = isRunning;
  stepSelect.disabled = isRunning;
}

function stopWorker() {
  if (!worker) return;
  worker.terminate();
  worker = null;
}

function updateProgress(value) {
  const bounded = Math.max(0, Math.min(100, value));
  progressText.textContent = `${bounded.toFixed(bounded >= 99 ? 0 : 1)}%`;
  progressBar.style.width = `${bounded}%`;
}

function renderResults() {
  resultCount.textContent = results.length.toLocaleString();
  const visible = results.slice(0, 500);
  resultsBody.innerHTML = visible
    .map(({ x, z }) => {
      const command = `/tp @s ${x} ~ ${z}`;
      return `
        <tr data-command="${command}">
          <td class="px-3 py-2 tabular-nums text-stone-100">${x}</td>
          <td class="px-3 py-2 tabular-nums text-stone-100">${z}</td>
          <td class="px-3 py-2 text-emerald-300">複製</td>
        </tr>
      `;
    })
    .join("");

  if (results.length > visible.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="3" class="px-3 py-3 text-center text-stone-400">另有 ${(results.length - visible.length).toLocaleString()} 筆結果未列出，地圖仍會完整顯示。</td>`;
    resultsBody.appendChild(row);
  }
}

function drawMap(points, radius, biome) {
  const width = mapCanvas.width;
  const height = mapCanvas.height;
  const color = BIOMES[biome]?.color || "#34d399";

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0c0a09";
  ctx.fillRect(0, 0, width, height);

  const margin = 34;
  const mapSize = Math.min(width, height) - margin * 2;
  const left = (width - mapSize) / 2;
  const top = (height - mapSize) / 2;
  const scale = mapSize / (radius * 2);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, mapSize, mapSize);

  for (let i = 1; i < 4; i += 1) {
    const x = left + (mapSize / 4) * i;
    const y = top + (mapSize / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + mapSize);
    ctx.moveTo(left, y);
    ctx.lineTo(left + mapSize, y);
    ctx.stroke();
  }

  const originX = left + mapSize / 2;
  const originY = top + mapSize / 2;
  ctx.strokeStyle = "rgba(52, 211, 153, 0.5)";
  ctx.beginPath();
  ctx.moveTo(originX, top);
  ctx.lineTo(originX, top + mapSize);
  ctx.moveTo(left, originY);
  ctx.lineTo(left + mapSize, originY);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "14px Inter, system-ui, sans-serif";
  ctx.fillText("-X", left, originY - 8);
  ctx.fillText("+X", left + mapSize - 18, originY - 8);
  ctx.fillText("-Z", originX + 8, top + 16);
  ctx.fillText("+Z", originX + 8, top + mapSize - 8);

  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  points.forEach(({ x, z }) => {
    const px = originX + x * scale;
    const py = originY + z * scale;
    ctx.beginPath();
    ctx.arc(px, py, 3.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(originX, originY, 4, 0, Math.PI * 2);
  ctx.fill();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function workerSource() {
  return `
    let stopped = false;

    self.onmessage = ({ data }) => {
      if (data.type === "stop") {
        stopped = true;
        return;
      }

      if (data.type !== "start") return;
      stopped = false;
      scan(data.payload, data.biomes);
    };

    function scan(payload, biomes) {
      const { seed, biome, radius, step } = payload;
      const seedValue = normalizeSeed(seed);
      const coords = [];
      for (let v = -radius; v <= radius; v += step) coords.push(v);

      const total = coords.length * coords.length;
      let checked = 0;
      let lastPost = performance.now();
      let batch = [];

      for (let zi = 0; zi < coords.length; zi += 1) {
        const z = coords[zi];
        for (let xi = 0; xi < coords.length; xi += 1) {
          if (stopped) {
            self.postMessage({ type: "stopped" });
            return;
          }

          const x = coords[xi];
          if (getBiome(seedValue, x, z, biomes) === biome) {
            batch.push({ x, z });
          }

          checked += 1;
          const now = performance.now();
          if (batch.length >= 100 || now - lastPost > 80) {
            self.postMessage({
              type: "batch",
              results: batch,
              checked,
              total,
              progress: (checked / total) * 100
            });
            batch = [];
            lastPost = now;
          }
        }
      }

      if (batch.length) {
        self.postMessage({ type: "batch", results: batch, checked, total, progress: 100 });
      }
      self.postMessage({ type: "done" });
    }

    function normalizeSeed(seed) {
      if (/^-?\\d+$/.test(seed)) {
        return BigInt(seed);
      }

      let hash = 0xcbf29ce484222325n;
      for (const char of seed) {
        hash ^= BigInt(char.codePointAt(0));
        hash *= 0x100000001b3n;
        hash &= 0xffffffffffffffffn;
      }
      return BigInt.asIntN(64, hash);
    }

    function getBiome(seedValue, x, z, biomes) {
      // Adapter point: replace this body with cubiomes-js/prismarine getBiome(seed, x, z).
      const nx = Math.floor(x / 64);
      const nz = Math.floor(z / 64);
      const continentalness = octave(seedValue, nx, nz, 11);
      const temperature = octave(seedValue, nx, nz, 23);
      const humidity = octave(seedValue, nx, nz, 37);
      const erosion = octave(seedValue, nx, nz, 53);
      const weirdness = octave(seedValue, nx, nz, 71);
      const roll = octave(seedValue, nx, nz, 97);

      if (temperature < 0.18 && humidity < 0.52 && weirdness > 0.55) return "ice_spikes";
      if (temperature < 0.28) return "snowy_plains";
      if (humidity > 0.74 && temperature > 0.64 && continentalness > 0.22) return "mangrove_swamp";
      if (humidity > 0.62 && temperature > 0.58) return "jungle";
      if (temperature > 0.72 && humidity < 0.34 && erosion > 0.45) return "badlands";
      if (temperature > 0.66 && humidity < 0.42) return "desert";
      if (Math.abs(continentalness - 0.5) < 0.035 && roll < biomes.mushroom_fields.rarity) return "mushroom_fields";
      if (temperature > 0.42 && temperature < 0.68 && humidity > 0.48 && weirdness > 0.68 && roll < 0.62) return "cherry_grove";

      const fallback = [
        ["desert", biomes.desert.rarity],
        ["snowy_plains", biomes.snowy_plains.rarity],
        ["jungle", biomes.jungle.rarity],
        ["badlands", biomes.badlands.rarity],
      ];
      let threshold = 0;
      for (const [name, rarity] of fallback) {
        threshold += rarity;
        if (roll < threshold) return name;
      }
      return humidity > 0.5 ? "jungle" : "desert";
    }

    function octave(seed, x, z, salt) {
      const a = valueNoise(seed, x, z, salt);
      const b = valueNoise(seed, Math.floor(x / 3), Math.floor(z / 3), salt + 1009);
      const c = valueNoise(seed, Math.floor(x / 9), Math.floor(z / 9), salt + 2003);
      return (a * 0.55) + (b * 0.3) + (c * 0.15);
    }

    function valueNoise(seed, x, z, salt) {
      let n = BigInt.asUintN(64, seed);
      n ^= BigInt.asUintN(64, BigInt(x) * 0x9e3779b97f4a7c15n);
      n ^= BigInt.asUintN(64, BigInt(z) * 0xbf58476d1ce4e5b9n);
      n ^= BigInt(salt) * 0x94d049bb133111ebn;
      n ^= n >> 30n;
      n *= 0xbf58476d1ce4e5b9n;
      n ^= n >> 27n;
      n *= 0x94d049bb133111ebn;
      n ^= n >> 31n;
      return Number(n & 0xffffffn) / 0xffffff;
    }
  `;
}
