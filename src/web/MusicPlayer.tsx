import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Visualizer } from "./Visualizer";
import { deleteTrack, loadTracks, readPrefs, saveTrack, savePrefs, type PlayerPrefs, type Track } from "./musicStore";

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i;

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds)) return "0:00";
	return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function MusicPlayer() {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	// Built on first play (browsers only allow audio processing after a click): song → analyser for the visualizer,
	// and song → volume → speakers, so the bars don't shrink when you turn the volume down.
	const graphRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; gain: GainNode } | null>(null);
	const [tracks, setTracks] = useState<Track[]>([]);
	const [prefs, setPrefs] = useState<PlayerPrefs>(readPrefs);
	const [playing, setPlaying] = useState(false);
	const [time, setTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [open, setOpen] = useState(false);
	const [dragging, setDragging] = useState<number | null>(null);
	const [renaming, setRenaming] = useState<string | null>(null);
	// Handlers attached once to the audio element read the latest state through this ref.
	const latest = useRef({ tracks, prefs });

	useEffect(() => {
		latest.current = { tracks, prefs };
		savePrefs(prefs);
	});

	const current = tracks.find((t) => t.id === prefs.currentId) ?? null;

	useEffect(() => {
		void loadTracks()
			.then((saved) => {
				const byId = new Map(saved.map((t) => [t.id, t]));
				const { order } = readPrefs();
				const ordered = [...order.flatMap((id) => byId.get(id) ?? []), ...saved.filter((t) => !order.includes(t.id))];
				setTracks(ordered);
			})
			.catch(() => setTracks([]));
	}, []);

	function update(change: Partial<PlayerPrefs>) {
		setPrefs((p) => ({ ...p, ...change }));
	}

	function setOrder(next: Track[]) {
		setTracks(next);
		update({ order: next.map((t) => t.id) });
	}

	function step(direction: 1 | -1, fromEnd = false) {
		const { tracks: list, prefs: p } = latest.current;
		if (list.length === 0) return;
		const index = list.findIndex((t) => t.id === p.currentId);
		let next: number;
		if (p.shuffle && list.length > 1) {
			do next = Math.floor(Math.random() * list.length);
			while (next === index);
		} else {
			next = index + direction;
			if (next >= list.length) {
				// Running off the end stops the music unless the playlist repeats.
				if (fromEnd && p.repeat === "off") {
					setPlaying(false);
					return;
				}
				next = 0;
			}
			if (next < 0) next = list.length - 1;
		}
		// The same song again (a one-song playlist) isn't a change the effects below react to, so restart it here.
		const audio = audioRef.current;
		if (list[next].id === p.currentId && audio) {
			audio.currentTime = 0;
			void audio.play().catch(() => setPlaying(false));
		}
		update({ currentId: list[next].id });
		setPlaying(true);
	}

	useEffect(() => {
		const audio = new Audio();
		audio.preload = "metadata";
		audioRef.current = audio;
		const onTime = () => setTime(audio.currentTime);
		const onMeta = () => setDuration(audio.duration);
		const onEnded = () => step(1, true);
		audio.addEventListener("timeupdate", onTime);
		audio.addEventListener("loadedmetadata", onMeta);
		audio.addEventListener("ended", onEnded);
		return () => {
			audio.pause();
			audio.removeEventListener("timeupdate", onTime);
			audio.removeEventListener("loadedmetadata", onMeta);
			audio.removeEventListener("ended", onEnded);
		};
		// step only reads state through the latest ref, so the element is set up once.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Each track plays from a temporary in-memory link that's released when the song changes.
	// Keyed on the file, so renaming the playing song doesn't restart it.
	const currentFile = current?.file;
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio || !currentFile) return;
		const url = URL.createObjectURL(currentFile);
		audio.src = url;
		setTime(0);
		return () => URL.revokeObjectURL(url);
	}, [currentFile]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio || !current) return;
		if (playing) {
			if (!graphRef.current) {
				const ctx = new AudioContext();
				const source = ctx.createMediaElementSource(audio);
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 2048;
				analyser.smoothingTimeConstant = 0.8;
				const gain = ctx.createGain();
				source.connect(analyser);
				source.connect(gain).connect(ctx.destination);
				graphRef.current = { ctx, analyser, gain };
				audio.volume = 1;
				gain.gain.value = latest.current.prefs.volume;
			}
			void graphRef.current.ctx.resume();
			void audio.play().catch(() => setPlaying(false));
		} else audio.pause();
	}, [playing, current]);

	useEffect(() => {
		if (graphRef.current) graphRef.current.gain.gain.value = prefs.volume;
		else if (audioRef.current) audioRef.current.volume = prefs.volume;
	}, [prefs.volume]);

	useEffect(() => {
		if (audioRef.current) audioRef.current.loop = prefs.repeat === "one";
	}, [prefs.repeat]);

	// Keyboard media keys and the Windows media popup control the player through the Media Session API.
	useEffect(() => {
		if (!("mediaSession" in navigator)) return;
		navigator.mediaSession.metadata = current ? new MediaMetadata({ title: current.name, artist: "Etch" }) : null;
		navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
		navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
		navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
		navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [current]);

	async function addFiles(files: FileList | null) {
		const audioFiles = Array.from(files ?? []).filter(
			(f) => f.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(f.name),
		);
		const added = audioFiles.map((file) => ({
			id: crypto.randomUUID(),
			name: file.name.replace(/\.[^.]+$/, ""),
			file,
		}));
		if (added.length === 0) return;
		await Promise.all(added.map((t) => saveTrack(t).catch(() => undefined)));
		const next = [...latest.current.tracks, ...added];
		setOrder(next);
		if (!latest.current.prefs.currentId) update({ currentId: added[0].id });
	}

	async function rename(track: Track, name: string) {
		setRenaming(null);
		const trimmed = name.trim();
		if (!trimmed || trimmed === track.name) return;
		const renamed = { ...track, name: trimmed };
		setTracks((list) => list.map((t) => (t.id === track.id ? renamed : t)));
		await saveTrack(renamed).catch(() => undefined);
	}

	async function remove(track: Track) {
		await deleteTrack(track.id).catch(() => undefined);
		const next = tracks.filter((t) => t.id !== track.id);
		setOrder(next);
		if (track.id === prefs.currentId) {
			setPlaying(false);
			update({ currentId: next[0]?.id ?? null });
		}
	}

	function previous() {
		// Like most players: back restarts the song unless you're at its very start.
		const audio = audioRef.current;
		if (audio && audio.currentTime > 3) audio.currentTime = 0;
		else step(-1);
	}

	const repeatLabel = { off: "Repeat off", all: "Repeat all", one: "Repeat one" }[prefs.repeat];

	return (
		<div className={open ? "music open" : "music"}>
			{open && (
				<section className="music-panel" aria-label="Music player">
					<Visualizer graph={graphRef} playing={playing} />
					<div className="music-now">
						<span className="label">{current ? "Now playing" : "No songs yet"}</span>
						<span className="music-title">{current?.name ?? "Add songs from your PC"}</span>
					</div>
					{current && (
						<>
							<input
								type="range"
								className="music-seek"
								min={0}
								max={duration || 0}
								step={0.1}
								value={Math.min(time, duration || 0)}
								aria-label="Seek"
								onChange={(e) => {
									if (audioRef.current) audioRef.current.currentTime = Number(e.target.value);
								}}
								style={{ "--fill": `${duration ? (time / duration) * 100 : 0}%` } as CSSProperties}
							/>
							<div className="music-times">
								<span>{formatTime(time)}</span>
								<span>{formatTime(duration)}</span>
							</div>
							<div className="music-controls">
								<button
									className={prefs.shuffle ? "icon-toggle on" : "icon-toggle"}
									aria-pressed={prefs.shuffle}
									aria-label="Shuffle"
									title="Shuffle"
									onClick={() => update({ shuffle: !prefs.shuffle })}
								>
									<Icon name="shuffle" />
								</button>
								<button className="icon-toggle" aria-label="Previous" onClick={previous}>
									<Icon name="previous" />
								</button>
								<button
									className="play-toggle"
									aria-label={playing ? "Pause" : "Play"}
									onClick={() => setPlaying((p) => !p)}
								>
									<Icon name={playing ? "pause" : "play"} />
								</button>
								<button className="icon-toggle" aria-label="Next" onClick={() => step(1)}>
									<Icon name="next" />
								</button>
								<button
									className={prefs.repeat === "off" ? "icon-toggle" : "icon-toggle on"}
									aria-label={repeatLabel}
									title={repeatLabel}
									onClick={() =>
										update({ repeat: prefs.repeat === "off" ? "all" : prefs.repeat === "all" ? "one" : "off" })
									}
								>
									<Icon name={prefs.repeat === "one" ? "repeat-one" : "repeat"} />
								</button>
							</div>
							<label className="music-volume">
								<Icon name="volume" />
								<input
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={prefs.volume}
									aria-label="Volume"
									onChange={(e) => update({ volume: Number(e.target.value) })}
									style={{ "--fill": `${prefs.volume * 100}%` } as CSSProperties}
								/>
							</label>
						</>
					)}
					{tracks.length > 0 && (
						<ol className="music-list">
							{tracks.map((track, i) => (
								<li
									key={track.id}
									draggable
									className={[track.id === prefs.currentId && "current", dragging === i && "dragging"]
										.filter(Boolean)
										.join(" ")}
									onDragStart={() => setDragging(i)}
									onDragEnd={() => setDragging(null)}
									onDragOver={(e) => {
										e.preventDefault();
										if (dragging === null || dragging === i) return;
										const next = [...tracks];
										const [moved] = next.splice(dragging, 1);
										next.splice(i, 0, moved);
										setDragging(i);
										setOrder(next);
									}}
								>
									{renaming === track.id ? (
										<input
											className="track-rename"
											defaultValue={track.name}
											aria-label={`Rename ${track.name}`}
											autoFocus
											onFocus={(e) => e.target.select()}
											onBlur={(e) => void rename(track, e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") e.currentTarget.blur();
												if (e.key === "Escape") {
													e.stopPropagation();
													setRenaming(null);
												}
											}}
										/>
									) : (
										<button
											className="music-track"
											onClick={() => {
												update({ currentId: track.id });
												setPlaying(true);
											}}
											onDoubleClick={() => setRenaming(track.id)}
										>
											{track.id === prefs.currentId && playing ? (
												<Bars />
											) : (
												<span className="track-number">{i + 1}</span>
											)}
											<span className="track-name">{track.name}</span>
										</button>
									)}
									<button
										className="icon-button"
										aria-label={`Rename ${track.name}`}
										title="Rename"
										onClick={() => setRenaming(track.id)}
									>
										<Icon name="pencil" />
									</button>
									<button
										className="icon-button"
										aria-label={`Remove ${track.name}`}
										onClick={() => void remove(track)}
									>
										×
									</button>
								</li>
							))}
						</ol>
					)}
					<div className="music-add">
						<label className="button">
							Add songs
							<input
								type="file"
								accept="audio/*"
								multiple
								onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ""))}
							/>
						</label>
						<label className="button">
							Add a folder
							<input
								type="file"
								// Folder picking has no React prop; the browser attribute has to be set directly.
								ref={(input) => input?.setAttribute("webkitdirectory", "")}
								onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ""))}
							/>
						</label>
					</div>
					<p className="hint">Songs stay on this PC and are never uploaded.</p>
				</section>
			)}
			<div className="music-dock">
				<button
					className="music-launcher"
					aria-expanded={open}
					aria-label={open ? "Hide music player" : "Show music player"}
					onClick={() => setOpen((o) => !o)}
				>
					{playing ? <Bars /> : <Icon name="note" />}
				</button>
				{!open && current && (
					<div className="music-mini">
						<span className="music-title">{current.name}</span>
						<button
							className="icon-toggle"
							aria-label={playing ? "Pause" : "Play"}
							onClick={() => setPlaying((p) => !p)}
						>
							<Icon name={playing ? "pause" : "play"} />
						</button>
						<button className="icon-toggle" aria-label="Next" onClick={() => step(1)}>
							<Icon name="next" />
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function Bars() {
	return (
		<span className="bars" aria-hidden>
			<span />
			<span />
			<span />
		</span>
	);
}

const ICONS: Record<string, string> = {
	play: "M5 3.5v9l7.5-4.5z",
	pause: "M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z",
	next: "M3.5 3.5v9l6-4.5zM10.5 3.5h2v9h-2z",
	previous: "M12.5 3.5v9l-6-4.5zM3.5 3.5h2v9h-2z",
	shuffle: "M2 4.5h2.5l6 7H14M2 11.5h2.5l1.8-2.1M9.7 6.6l.8-1.1H14M12 3l2 1.5-2 1.5M12 10l2 1.5-2 1.5",
	repeat: "M3 7V6a1.5 1.5 0 0 1 1.5-1.5H12M10.5 3L12 4.5 10.5 6M13 9v1a1.5 1.5 0 0 1-1.5 1.5H4M5.5 13L4 11.5 5.5 10",
	"repeat-one":
		"M3 7V6a1.5 1.5 0 0 1 1.5-1.5H12M10.5 3L12 4.5 10.5 6M13 9v1a1.5 1.5 0 0 1-1.5 1.5H4M5.5 13L4 11.5 5.5 10M7.5 7l1-.5v3",
	volume: "M2.5 6h2l3-2.5v9l-3-2.5h-2zM10 5.5a3.5 3.5 0 0 1 0 5M11.8 3.8a6 6 0 0 1 0 8.4",
	pencil: "M10.5 3l2.5 2.5L6 12.5H3.5V10zM9 4.5L11.5 7",
	note: "M6 12V3.5l7-1.5v8.5M6 12a1.8 1.8 0 1 1-1.8-1.8A1.8 1.8 0 0 1 6 12zM13 10.5a1.8 1.8 0 1 1-1.8-1.8 1.8 1.8 0 0 1 1.8 1.8z",
};

// Shapes that read best filled; the rest are drawn as strokes.
const FILLED = new Set(["play", "pause", "next", "previous"]);

function Icon({ name }: { name: string }) {
	return (
		<svg viewBox="0 0 16 16" aria-hidden className={FILLED.has(name) ? "icon filled" : "icon"}>
			<path d={ICONS[name]} />
		</svg>
	);
}
