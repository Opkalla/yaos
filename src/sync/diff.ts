/**
 * Character-level diff utility for applying external text changes to a Y.Text
 * as targeted inserts/deletes rather than a wholesale replace.
 *
 * This preserves CRDT history and cursor positions when an external tool
 * (git, another editor) modifies a file that's currently open.
 */
import diff from "fast-diff";
import * as Y from "yjs";

/**
 * Diff operation: retain N chars, delete N chars, or insert a string.
 */
type DiffOp =
	| { type: "retain"; count: number }
	| { type: "delete"; count: number }
	| { type: "insert"; text: string };

/**
 * Compute a character diff between the current Y.Text state and `newText`,
 * then apply it to the Y.Text as a series of targeted operations.
 *
 * The current Y.Text is read *inside* the transaction so that positions are
 * always computed relative to the live CRDT state at mutation time, not a
 * snapshot that may have been invalidated by concurrent remote updates.
 *
 * Uses `fast-diff`, a compact Myers-style diff implementation.
 */
export function applyDiffToYText(
	ytext: Y.Text,
	newText: string,
	origin: string,
): void {
	// Apply to Y.Text in a single transaction so collaborators see one patch.
	// Reading the current text inside the transaction ensures the diff positions
	// are always correct even if remote updates arrive before this runs.
	ytext.doc?.transact(() => {
		const currentText = ytext.toString();
		if (currentText === newText) return;

		// `fast-diff` gives us a synchronous Myers-style patch without building
		// the old quadratic DP matrix that used to freeze on large notes.
		const charOps = diffToCharOps(diff(currentText, newText));
		if (charOps.length === 0) return;

		let cursor = 0;
		for (const op of charOps) {
			switch (op.type) {
				case "retain":
					cursor += op.count;
					break;
				case "delete":
					ytext.delete(cursor, op.count);
					break;
				case "insert":
					ytext.insert(cursor, op.text);
					cursor += op.text.length;
					break;
			}
		}
	}, origin);
}

function diffToCharOps(segments: Array<[-1 | 0 | 1, string]>): DiffOp[] {
	const ops: DiffOp[] = [];

	for (const [kind, text] of segments) {
		if (text.length === 0) continue;

		switch (kind) {
			case 0:
				pushRetain(ops, text.length);
				break;
			case -1:
				pushDelete(ops, text.length);
				break;
			case 1:
				pushInsert(ops, text);
				break;
		}
	}

	return ops;
}

function pushRetain(ops: DiffOp[], count: number): void {
	if (count <= 0) return;
	const last = ops[ops.length - 1];
	if (last?.type === "retain") {
		last.count += count;
		return;
	}
	ops.push({ type: "retain", count });
}

function pushDelete(ops: DiffOp[], count: number): void {
	if (count <= 0) return;
	const last = ops[ops.length - 1];
	if (last?.type === "delete") {
		last.count += count;
		return;
	}
	ops.push({ type: "delete", count });
}

function pushInsert(ops: DiffOp[], text: string): void {
	if (text.length === 0) return;
	const last = ops[ops.length - 1];
	if (last?.type === "insert") {
		last.text += text;
		return;
	}
	ops.push({ type: "insert", text });
}
