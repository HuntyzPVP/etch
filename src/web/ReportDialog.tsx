import { useRef, useState } from "react";
import { api } from "./api";

const PERIODS = [
	{ days: 7, label: "Last 7 days" },
	{ days: 30, label: "Last 30 days" },
] as const;

type Days = (typeof PERIODS)[number]["days"];

export function ReportButton() {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [days, setDays] = useState<Days>(7);
	const [report, setReport] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [writing, setWriting] = useState(false);
	const [copied, setCopied] = useState(false);

	async function write() {
		setWriting(true);
		setError(null);
		setCopied(false);
		try {
			const res = await api.report.$post({ json: { days } });
			const body = (await res.json()) as { report?: string; error?: string };
			if (body.report) setReport(body.report);
			else setError(body.error ?? "Couldn't write the report.");
		} catch {
			setError("Couldn't reach Etch. Is the server running?");
		} finally {
			setWriting(false);
		}
	}

	async function copy() {
		if (!report) return;
		await navigator.clipboard.writeText(report);
		setCopied(true);
	}

	return (
		<>
			<button className="report-open" onClick={() => dialogRef.current?.showModal()}>
				Progress report
			</button>
			<dialog ref={dialogRef} className="confirm report">
				<div className="report-body">
					<h2>Progress report</h2>
					<p>What you logged and how your reviews went, written to paste into an AI chat for career planning.</p>
					<div className="row">
						<div className="segmented" role="tablist">
							{PERIODS.map((p) => (
								<button
									key={p.days}
									role="tab"
									aria-selected={days === p.days}
									className={days === p.days ? "selected" : undefined}
									disabled={writing}
									onClick={() => {
										if (p.days === days) return;
										setDays(p.days);
										setReport(null);
										setError(null);
									}}
								>
									{p.label}
								</button>
							))}
						</div>
						<button className={writing ? "generate busy" : "generate"} disabled={writing} onClick={() => void write()}>
							{writing ? "Writing…" : report ? "Write again" : "Write report"}
						</button>
					</div>
					{error && <p className="error">{error}</p>}
					{report && (
						<textarea className="report-text" readOnly value={report} rows={14} aria-label="Progress report" />
					)}
					<div className="actions">
						<button onClick={() => dialogRef.current?.close()}>Close</button>
						{report && (
							<button className="primary" onClick={() => void copy()}>
								{copied ? "Copied" : "Copy"}
							</button>
						)}
					</div>
				</div>
			</dialog>
		</>
	);
}
