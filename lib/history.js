// Analysis history, kept in this browser only (IndexedDB). Nothing here is sent anywhere.
// One record per image, keyed by a hash of the file's bytes, so re-uploading the same design
// updates its entry instead of adding a duplicate, and reopening it gives the same reading.

const DB = "neuro-ui-analyzer";
const STORE = "analyses";
const VERSION = 1;
const LIMIT = 30; // most recent designs kept
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // larger uploads are stored as a re-encoded copy

let dbPromise;
function open() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const out = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

const notify = () => {
  try {
    window.dispatchEvent(new Event("nua:history"));
  } catch {}
};

// Small top-of-page crop for the history grid.
async function makeThumb(bmp) {
  const w = 480;
  const h = 360;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const scale = w / bmp.width;
  canvas.getContext("2d").drawImage(bmp, 0, 0, bmp.width, Math.min(bmp.height, h / scale), 0, 0, w, Math.min(h, bmp.height * scale));
  return new Promise((r) => canvas.toBlob(r, "image/webp", 0.8));
}

async function storableImage(file, bmp) {
  if (file.size <= MAX_IMAGE_BYTES) return file;
  const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
}

// Called once the pixel analysis finishes. Keeps any deep analysis already saved for this image.
export async function saveAnalysis(id, file, result) {
  if (!id) return;
  try {
    const bmp = await createImageBitmap(file);
    const [thumb, image, existing] = await Promise.all([makeThumb(bmp), storableImage(file, bmp), getAnalysis(id)]);
    const now = Date.now();
    const m = result.metrics;
    const record = {
      ...legacy(id),
      ...existing,
      id,
      name: file.name && file.name !== "sample" ? file.name : existing?.name || "Untitled design",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      image,
      thumb,
      result,
      summary: {
        width: m.image.width,
        height: m.image.height,
        format: m.image.format,
        clutter: m.clutterScore,
        whitespace: m.whitespacePct,
        peakZone: m.attention?.peakZone,
        ctaSeenMs: result.scanpath?.ctaHit ? result.scanpath.ctaHit.start : null,
        hasCta: Boolean(m.ctaCandidate),
      },
    };
    await run("readwrite", (s) => s.put(record));
    await prune();
    notify();
  } catch (e) {
    // Saving is a convenience: a full or blocked store must never break the analysis.
    console.warn("Could not save to history.", e);
  }
}

// Adds the deep analysis (content features, written review) to an existing entry.
export async function patchAnalysis(id, patch) {
  if (!id) return;
  try {
    const existing = await getAnalysis(id);
    if (!existing) return;
    await run("readwrite", (s) => s.put({ ...existing, ...patch }));
    notify();
  } catch (e) {
    console.warn("Could not update history.", e);
  }
}

export async function getAnalysis(id) {
  if (!id) return null;
  try {
    return (await run("readonly", (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

// Newest first, without the full image and result, which the grid doesn't need.
export async function listAnalyses() {
  try {
    const all = await run("readonly", (s) => s.getAll());
    return all
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ id, name, createdAt, updatedAt, thumb, summary, review, features }) => ({
        id,
        name,
        createdAt,
        updatedAt,
        thumb,
        summary,
        deep: Boolean(review || features),
      }));
  } catch {
    return [];
  }
}

export async function deleteAnalysis(id) {
  try {
    await run("readwrite", (s) => s.delete(id));
    notify();
  } catch {}
}

export async function clearHistory() {
  try {
    await run("readwrite", (s) => s.clear());
    notify();
  } catch {}
}

async function prune() {
  const all = await run("readonly", (s) => s.getAll());
  if (all.length <= LIMIT) return;
  const old = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(LIMIT);
  await run("readwrite", (s) => old.forEach((r) => s.delete(r.id)));
}

// The previous version cached the deep analysis in localStorage. Carry it over once, then drop it.
function legacy(id) {
  try {
    const key = "nua:v4:" + id;
    const old = JSON.parse(localStorage.getItem(key));
    localStorage.removeItem(key);
    return old ? { features: old.features, review: old.review } : {};
  } catch {
    return {};
  }
}
