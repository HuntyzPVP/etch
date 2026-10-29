import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ConfirmOptions = { title: string; message?: string; action: string };
type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false));

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
	const [options, setOptions] = useState<ConfirmOptions | null>(null);

	const confirm = useCallback<Confirm>(
		(next) =>
			new Promise((resolve) => {
				resolveRef.current = resolve;
				setOptions(next);
			}),
		[],
	);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (options && dialog && !dialog.open) {
			dialog.returnValue = "";
			dialog.showModal();
		}
	}, [options]);

	return (
		<ConfirmContext value={confirm}>
			{children}
			<dialog
				ref={dialogRef}
				className="confirm"
				onClose={(e) => {
					// Escape and Cancel both leave returnValue as something other than "confirm".
					resolveRef.current?.(e.currentTarget.returnValue === "confirm");
					resolveRef.current = null;
					setOptions(null);
				}}
			>
				{options && (
					<form method="dialog">
						<h2>{options.title}</h2>
						{options.message && <p>{options.message}</p>}
						<div className="actions">
							<button value="cancel" autoFocus>
								Cancel
							</button>
							<button value="confirm" className="danger">
								{options.action}
							</button>
						</div>
					</form>
				)}
			</dialog>
		</ConfirmContext>
	);
}
