// Songs live in the browser's own database on this PC, so they survive reloads without being uploaded anywhere.
export type Track = { id: string; name: string; file: Blob };

const DB_NAME = "etch-music";
const STORE = "tracks";

function openDb() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
	const db = await openDb();
	return new Promise<T>((resolve, reject) => {
		const request = action(db.transaction(STORE, mode).objectStore(STORE));
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	}).finally(() => db.close());
}

export const loadTracks = () => run<Track[]>("readonly", (store) => store.getAll());
export const saveTrack = (track: Track) => run("readwrite", (store) => store.put(track));
export const deleteTrack = (id: string) => run("readwrite", (store) => store.delete(id));

// Small player preferences, including the playlist order, sit beside the songs in localStorage.
export type PlayerPrefs = {
	order: string[];
	currentId: string | null;
	volume: number;
	shuffle: boolean;
	repeat: "off" | "all" | "one";
};

const PREFS_KEY = "etch-music-prefs";
const DEFAULT_PREFS: PlayerPrefs = { order: [], currentId: null, volume: 0.7, shuffle: false, repeat: "all" };

export function readPrefs(): PlayerPrefs {
	try {
		const saved = localStorage.getItem(PREFS_KEY);
		return saved ? { ...DEFAULT_PREFS, ...(JSON.parse(saved) as Partial<PlayerPrefs>) } : DEFAULT_PREFS;
	} catch {
		return DEFAULT_PREFS;
	}
}

export function savePrefs(prefs: PlayerPrefs) {
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch {
		// Preferences just won't persist.
	}
}
