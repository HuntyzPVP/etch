import { useEffect, useRef, type RefObject } from "react";

const BARS = 40;
const MIN_HZ = 40;
const MAX_HZ = 14000;

type Props = { graph: RefObject<{ analyser: AnalyserNode; ctx: AudioContext } | null>; playing: boolean };

export function Visualizer({ graph, playing }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	// Shown heights carry over between frames so bars rise quickly and fall back gently.
	const levels = useRef(new Float32Array(BARS));

	useEffect(() => {
		const canvas = canvasRef.current!;
		const draw = canvas.getContext("2d")!;
		const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
		let frame = 0;
		let data: Uint8Array<ArrayBuffer> | null = null;

		function render() {
			const dpr = window.devicePixelRatio || 1;
			const width = Math.round(canvas.clientWidth * dpr);
			const height = Math.round(canvas.clientHeight * dpr);
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}

			const analyser = graph.current?.analyser;
			if (analyser && playing) {
				if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount);
				analyser.getByteFrequencyData(data);
			}
			const binHz = analyser ? analyser.context.sampleRate / analyser.fftSize : 1;

			let moving = false;
			for (let i = 0; i < BARS; i++) {
				let target = 0;
				if (data && analyser && playing) {
					// Bars are spaced evenly in pitch, not in Hz, so the bass doesn't squeeze into the first bar.
					const from = MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / BARS);
					const to = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((i + 1) / BARS);
					const start = Math.floor(from / binHz);
					const end = Math.max(start + 1, Math.ceil(to / binHz));
					let peak = 0;
					for (let b = start; b < end && b < data.length; b++) peak = Math.max(peak, data[b]);
					target = (peak / 255) ** 1.6;
				}
				const current = levels.current[i];
				levels.current[i] = target > current ? current + (target - current) * 0.6 : current * 0.88;
				if (levels.current[i] > 0.002) moving = true;
			}

			draw.clearRect(0, 0, width, height);
			const gap = 3 * dpr;
			const barWidth = (width - gap * (BARS - 1)) / BARS;
			draw.fillStyle = accent;
			for (let i = 0; i < BARS; i++) {
				const barHeight = Math.max(barWidth, levels.current[i] * height);
				draw.globalAlpha = 0.35 + levels.current[i] * 0.65;
				draw.beginPath();
				draw.roundRect(i * (barWidth + gap), height - barHeight, barWidth, barHeight, barWidth / 2);
				draw.fill();
			}

			// Stop drawing once paused bars have settled; the next play starts the loop again.
			if (playing || moving) frame = requestAnimationFrame(render);
		}
		frame = requestAnimationFrame(render);
		return () => cancelAnimationFrame(frame);
	}, [graph, playing]);

	return <canvas ref={canvasRef} className="visualizer" aria-hidden />;
}
