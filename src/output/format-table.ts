import ansis, { dim } from "ansis";
import { wrapDescription } from "./formatter.ts";

export interface Column<T> {
	value: (item: T) => string;
	style: (text: string) => string;
}

export interface TableOptions<T> {
	columns: Column<T>[];
	description?: (item: T) => string | undefined;
	separator?: string;
	emptyMessage?: string;
}

/** Measure visible length of a string (excluding ANSI escape codes) */
function visibleLength(s: string): number {
	return ansis.strip(s).length;
}

/** Get terminal width, or undefined if not a TTY */
function getTerminalWidth(): number | undefined {
	if (process.stdout.isTTY) return Math.max(process.stdout.columns - 1, 40);
	return undefined;
}

/**
 * Format a list of items as an aligned table with optional description wrapping.
 */
export function formatTable<T>(items: T[], options: TableOptions<T>): string {
	if (items.length === 0) {
		return dim(options.emptyMessage ?? "No items found");
	}

	const sep = options.separator ?? "  ";
	const termWidth = getTerminalWidth();

	// Calculate max width for each column
	const maxWidths = options.columns.map((col) =>
		Math.max(...items.map((item) => col.value(item).length)),
	);

	return items
		.map((item) => {
			const parts = options.columns.map((col, i) => {
				const raw = col.value(item);
				const pad = maxWidths[i]! - raw.length;
				return col.style(raw) + " ".repeat(Math.max(0, pad));
			});
			const prefix = parts.join(sep);

			const desc = options.description?.(item);
			if (desc) {
				const pw = visibleLength(prefix) + sep.length;
				const formatted = termWidth != null ? wrapDescription(desc, pw, termWidth) : dim(desc);
				return `${prefix}${sep}${formatted}`;
			}

			return prefix;
		})
		.join("\n");
}
