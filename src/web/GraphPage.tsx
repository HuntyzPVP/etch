import {
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type Simulation,
	type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router";
import { linkTitles, titleKey } from "../shared/links";
import { fetchEntries, type Entry } from "./api";

// id is null for a title that's linked to but has no note yet.
type GraphNode = SimulationNodeDatum & { key: string; title: string; id: number | null; degree: number };
type GraphLink = { source: string | GraphNode; target: string | GraphNode };
type Frame = { nodes: { key: string; title: string; id: number | null; degree: number; x: number; y: number }[] };
type Drag =
	| { kind: "node"; node: GraphNode; startX: number; startY: number; moved: boolean }
	| { kind: "pan"; startX: number; startY: number; origin: { x: number; y: number } };

const radius = (node: { degree: number }) => 5 + Math.sqrt(node.degree) * 3;
const linkKey = (a: string, b: string) => [a, b].sort().join("\n");
const endKey = (end: string | GraphNode) => (typeof end === "string" ? end : end.key);

function buildGraph(entries: Entry[]) {
	const nodes = new Map<string, GraphNode>();
	for (const e of entries)
		nodes.set(titleKey(e.topic), { key: titleKey(e.topic), title: e.topic, id: e.id, degree: 0 });
	const links: GraphLink[] = [];
	const seen = new Set<string>();
	for (const e of entries) {
		const from = titleKey(e.topic);
		for (const title of linkTitles(e.notes)) {
			const to = titleKey(title);
			if (to === from || seen.has(linkKey(from, to))) continue;
			if (!nodes.has(to)) nodes.set(to, { key: to, title, id: null, degree: 0 });
			seen.add(linkKey(from, to));
			links.push({ source: from, target: to });
			nodes.get(from)!.degree++;
			nodes.get(to)!.degree++;
		}
	}
	return { nodes: [...nodes.values()], links };
}

export function GraphPage() {
	const navigate = useNavigate();
	const svgRef = useRef<SVGSVGElement>(null);
	const sim = useRef<Simulation<GraphNode, undefined> | null>(null);
	const drag = useRef<Drag | null>(null);
	const [links, setLinks] = useState<[string, string][]>([]);
	const [frame, setFrame] = useState<Frame | null>(null);
	const [view, setView] = useState({ x: 0, y: 0, k: 1 });
	const [hovered, setHovered] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void fetchEntries().then((entries) => {
			if (cancelled) return;
			const graph = buildGraph(entries);
			const box = svgRef.current?.getBoundingClientRect();
			setView({ x: (box?.width ?? 800) / 2, y: (box?.height ?? 600) / 2, k: 1 });
			setLinks(graph.links.map((l) => [endKey(l.source), endKey(l.target)]));
			sim.current = forceSimulation(graph.nodes)
				.force(
					"link",
					forceLink<GraphNode, GraphLink>(graph.links)
						.id((n) => n.key)
						.distance(80),
				)
				.force("charge", forceManyBody().strength(-220))
				// Pulls notes without links toward the middle instead of letting them drift off.
				.force("x", forceX().strength(0.05))
				.force("y", forceY().strength(0.05))
				.force(
					"collide",
					forceCollide<GraphNode>((n) => radius(n) + 8),
				)
				.on("tick", () => setFrame({ nodes: graph.nodes.map((n) => ({ ...n, x: n.x ?? 0, y: n.y ?? 0 })) }));
		});
		return () => {
			cancelled = true;
			sim.current?.stop();
		};
	}, []);

	// Wheel zoom has to be a non-passive listener to stop the page from scrolling, which React's onWheel can't do.
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		function zoom(event: WheelEvent) {
			event.preventDefault();
			const box = svg!.getBoundingClientRect();
			const mx = event.clientX - box.left;
			const my = event.clientY - box.top;
			setView((v) => {
				const k = Math.min(4, Math.max(0.25, v.k * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
				return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
			});
		}
		svg.addEventListener("wheel", zoom, { passive: false });
		return () => svg.removeEventListener("wheel", zoom);
	}, []);

	function toGraph(event: PointerEvent) {
		const box = svgRef.current!.getBoundingClientRect();
		return { x: (event.clientX - box.left - view.x) / view.k, y: (event.clientY - box.top - view.y) / view.k };
	}

	function grabNode(event: PointerEvent, key: string) {
		const node = sim.current?.nodes().find((n) => n.key === key);
		if (!node) return;
		event.stopPropagation();
		svgRef.current!.setPointerCapture(event.pointerId);
		drag.current = { kind: "node", node, startX: event.clientX, startY: event.clientY, moved: false };
		node.fx = node.x;
		node.fy = node.y;
		sim.current!.alphaTarget(0.3).restart();
	}

	function grabBackground(event: PointerEvent) {
		svgRef.current!.setPointerCapture(event.pointerId);
		drag.current = { kind: "pan", startX: event.clientX, startY: event.clientY, origin: { x: view.x, y: view.y } };
	}

	function move(event: PointerEvent) {
		const d = drag.current;
		if (!d) return;
		if (d.kind === "pan") {
			setView((v) => ({ ...v, x: d.origin.x + event.clientX - d.startX, y: d.origin.y + event.clientY - d.startY }));
			return;
		}
		if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) > 4) d.moved = true;
		const at = toGraph(event);
		d.node.fx = at.x;
		d.node.fy = at.y;
	}

	function release() {
		const d = drag.current;
		drag.current = null;
		if (d?.kind !== "node") return;
		d.node.fx = null;
		d.node.fy = null;
		sim.current?.alphaTarget(0);
		if (!d.moved) {
			navigate(d.node.id === null ? `/log?topic=${encodeURIComponent(d.node.title)}` : `/notes/${d.node.id}`);
		}
	}

	const positions = new Map(frame?.nodes.map((n) => [n.key, n]));
	const neighbors = new Set(hovered ? links.filter((l) => l.includes(hovered)).flatMap((l) => l) : []);

	return (
		<div className="graph-page">
			<div className="page-heading">
				<h1>Graph</h1>
			</div>
			<svg
				ref={svgRef}
				className="graph"
				onPointerDown={grabBackground}
				onPointerMove={move}
				onPointerUp={release}
				onPointerCancel={release}
			>
				<g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
					{links.map(([a, b]) => {
						const from = positions.get(a);
						const to = positions.get(b);
						if (!from || !to) return null;
						const lit = hovered !== null && (a === hovered || b === hovered);
						return (
							<line
								key={linkKey(a, b)}
								className={lit ? "lit" : hovered ? "dim" : ""}
								x1={from.x}
								y1={from.y}
								x2={to.x}
								y2={to.y}
							/>
						);
					})}
					{frame?.nodes.map((n) => (
						<g
							key={n.key}
							className={[
								"graph-node",
								n.id === null && "missing",
								hovered === n.key && "lit",
								hovered && !neighbors.has(n.key) && hovered !== n.key && "dim",
							]
								.filter(Boolean)
								.join(" ")}
							transform={`translate(${n.x} ${n.y})`}
							onPointerDown={(e) => grabNode(e, n.key)}
							onPointerEnter={() => setHovered(n.key)}
							onPointerLeave={() => setHovered(null)}
						>
							<circle r={radius(n)} />
							{(view.k >= 0.6 || hovered === n.key) && <text y={radius(n) + 14}>{n.title}</text>}
						</g>
					))}
				</g>
			</svg>
			{frame?.nodes.length === 0 && (
				<p className="empty">No notes yet. Link notes with [[Title]] and they show up here.</p>
			)}
		</div>
	);
}
