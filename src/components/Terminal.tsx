import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactNode,
} from "react";
import { profile } from "@/data/profile";
import {
	Cmd,
	ErrorLine,
	Hint,
	Muted,
	TerminalContext,
	Welcome,
	complete,
	findCommand,
	suggest,
	tokenize,
	type TerminalApi,
} from "@/lib/terminal/commands";
import {
	DEFAULT_THEME,
	THEMES,
	isTheme,
	type ThemeName,
} from "@/lib/terminal/themes";

interface Entry {
	id: number;
	prompt?: string;
	promptLabel?: string;
	output?: ReactNode;
}

type ContactStep = "name" | "email" | "message" | "confirm";
interface ContactState {
	step: ContactStep;
	data: { name: string; email: string; message: string };
}

/** A one-shot question asked by a command, e.g. pacman's y/n. A null answer means cancelled. */
interface PendingAsk {
	label: string;
	onAnswer: (value: string | null) => void;
}

const CONTACT_PROMPTS: Record<ContactStep, string> = {
	name: "your name",
	email: "your email",
	message: "message",
	confirm: "send? (y/n)",
};

const QUICK = [
	"help",
	"about",
	"projects",
	"experience",
	"skills",
	"blog",
	"contact",
	"theme",
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let nextId = 1;

/**
 * True on phones and tablets: no hover plus a coarse pointer. A touchscreen laptop still
 * reports a mouse, so it keeps desktop behaviour. Keyed off pointer/hover rather than the
 * user agent for the same reason.
 */
const isTouchPrimary = () =>
	typeof window !== "undefined" &&
	window.matchMedia("(hover: none) and (pointer: coarse)").matches;

export function Terminal() {
	const [entries, setEntries] = useState<Entry[]>([
		{ id: 0, output: <Welcome /> },
	]);
	const [input, setInput] = useState("");
	const [history, setHistory] = useState<string[]>([]);
	const [histIdx, setHistIdx] = useState<number | null>(null);
	const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);
	const [contact, setContact] = useState<ContactState | null>(null);
	const [pending, setPendingState] = useState<PendingAsk | null>(null);
	// Starts false so the server-rendered boot screen matches the first client render; the
	// effect below fills it in.
	const [touch, setTouch] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const logRef = useRef<HTMLDivElement>(null);

	// Mirrored into a ref so the stable api callbacks can read the current question
	// without being re-created every time one is asked.
	const pendingRef = useRef<PendingAsk | null>(null);
	const setPending = useCallback((next: PendingAsk | null) => {
		pendingRef.current = next;
		setPendingState(next);
	}, []);

	/**
	 * Focus the input, except on touch devices. On a phone a programmatic focus() pops
	 * the on-screen keyboard, which is jarring when the visitor only tapped a command to
	 * read its output. Tapping the input itself still opens the keyboard — that is native
	 * browser behaviour and needs no JS. Pass force to focus anyway, for a command that is
	 * blocked until the visitor answers.
	 */
	const autoFocus = useCallback((force = false) => {
		if (force || !isTouchPrimary())
			inputRef.current?.focus({ preventScroll: true });
	}, []);

	const push = useCallback((entry: Omit<Entry, "id">) => {
		const id = nextId++;
		setEntries((e) => [...e, { ...entry, id }]);
		return id;
	}, []);

	const update = useCallback((id: number, output: ReactNode) => {
		setEntries((e) => e.map((x) => (x.id === id ? { ...x, output } : x)));
	}, []);

	const setTheme = useCallback((t: ThemeName) => {
		setThemeState(t);
		try {
			localStorage.setItem("shellfolio-theme", t);
		} catch {}
	}, []);

	const promptLabel = contact
		? CONTACT_PROMPTS[contact.step]
		: pending
			? pending.label
			: null;

	/* ---------- contact flow ---------- */

	const submitContact = useCallback(
		async (data: ContactState["data"]) => {
			const id = push({ output: <Muted>sending…</Muted> });
			try {
				const res = await fetch("/__forms.html", {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({
						"form-name": "contact",
						name: data.name,
						email: data.email,
						message: data.message,
					}).toString(),
				});
				update(
					id,
					res.ok ? (
						<span className="t-ok">sent</span>
					) : (
						<ErrorLine>failed to send. please try again.</ErrorLine>
					),
				);
			} catch {
				update(id, <ErrorLine>failed to send. please try again.</ErrorLine>);
			}
		},
		[push, update],
	);

	const handleContactInput = useCallback(
		(raw: string) => {
			if (!contact) return;
			const value = raw.trim();
			const label = CONTACT_PROMPTS[contact.step];
			if (value.toLowerCase() === "cancel") {
				push({
					promptLabel: label,
					prompt: raw,
					output: <Muted>contact cancelled.</Muted>,
				});
				setContact(null);
				return;
			}
			const { step, data } = contact;
			if (step === "name") {
				if (!value)
					return push({
						promptLabel: label,
						prompt: raw,
						output: <ErrorLine>name can't be empty.</ErrorLine>,
					});
				push({ promptLabel: label, prompt: raw });
				setContact({ step: "email", data: { ...data, name: value } });
			} else if (step === "email") {
				if (!EMAIL_RE.test(value))
					return push({
						promptLabel: label,
						prompt: raw,
						output: <ErrorLine>that doesn't look like an email.</ErrorLine>,
					});
				push({ promptLabel: label, prompt: raw });
				setContact({ step: "message", data: { ...data, email: value } });
			} else if (step === "message") {
				if (!value)
					return push({
						promptLabel: label,
						prompt: raw,
						output: <ErrorLine>message can't be empty.</ErrorLine>,
					});
				const next = { ...data, message: value };
				push({
					promptLabel: label,
					prompt: raw,
					output: (
						<div className="t-entry">
							<div>
								<Muted>from:</Muted> {next.name} &lt;{next.email}&gt;
							</div>
							<div>
								<Muted>body:</Muted> {next.message}
							</div>
						</div>
					),
				});
				setContact({ step: "confirm", data: next });
			} else {
				const yes = /^y(es)?$/i.test(value);
				const no = /^n(o)?$/i.test(value);
				if (!yes && !no)
					return push({
						promptLabel: label,
						prompt: raw,
						output: <ErrorLine>please answer y or n.</ErrorLine>,
					});
				push({
					promptLabel: label,
					prompt: raw,
					output: no ? <Muted>message discarded.</Muted> : undefined,
				});
				setContact(null);
				if (yes) void submitContact(data);
			}
		},
		[contact, push, submitContact],
	);

	/* ---------- command execution ---------- */

	// The asking command owns its own output, so it renders the answered prompt itself;
	// we only hand back the value.
	const handlePendingInput = useCallback(
		(raw: string) => {
			const waiting = pendingRef.current;
			if (!waiting) return;
			setPending(null);
			waiting.onAnswer(raw);
		},
		[setPending],
	);

	const apiRef = useRef<TerminalApi>(null!);

	const run = useCallback(
		(raw: string) => {
			const line = raw.trim();
			if (line)
				setHistory((h) => (h[h.length - 1] === line ? h : [...h, line]));
			setHistIdx(null);
			setInput("");

			const [name, ...args] = tokenize(line);
			if (!name) return push({ prompt: "" });

			const cmd = findCommand(name);
			if (!cmd) {
				const guess = suggest(name);
				return push({
					prompt: line,
					output: (
						<ErrorLine>
							command not found: {name}.{" "}
							{guess ? (
								<>
									Did you mean <Cmd>{guess}</Cmd>?
								</>
							) : null}{" "}
							Type <Cmd>help</Cmd> for a list.
						</ErrorLine>
					),
				});
			}
			if (cmd.name === "clear") {
				setEntries([]);
				return;
			}
			const output = cmd.run(args, apiRef.current);
			push({ prompt: line, output });
		},
		[push],
	);

	const api = useMemo<TerminalApi>(
		() => ({
			run: (line) => {
				// Clicking a command while mid-flow abandons whatever was waiting on input
				pendingRef.current?.onAnswer(null);
				setPending(null);
				setContact(null);
				run(line);
				autoFocus();
			},
			clear: () => setEntries([]),
			setTheme,
			theme,
			history,
			startContact: () =>
				setContact({
					step: "name",
					data: { name: "", email: "", message: "" },
				}),
			ask: (label, onAnswer) => {
				setContact(null);
				setPending({ label, onAnswer });
				// A question blocks the flow until it is answered, so the keyboard is what the
				// visitor wants — force it open even on a phone. iOS may ignore a focus() that no
				// gesture triggered; the tap hint below covers that case.
				autoFocus(true);
			},
		}),
		[run, setTheme, theme, history, setPending, autoFocus],
	);
	apiRef.current = api;

	/* ---------- effects ---------- */

	useEffect(() => {
		setTouch(isTouchPrimary());
	}, []);

	useEffect(() => {
		try {
			const saved = localStorage.getItem("shellfolio-theme");
			if (saved && isTheme(saved)) setThemeState(saved);
		} catch {}
		// Deep link: /?cmd=projects runs a command on load
		const cmd = new URLSearchParams(window.location.search).get("cmd");
		if (cmd) run(cmd);
		autoFocus();
	}, [run, autoFocus]);

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [entries, contact]);

	// Commands can reveal output over time without adding entries, so follow the log
	// as it grows rather than only when an entry is appended.
	useEffect(() => {
		const log = logRef.current;
		const screen = scrollRef.current;
		if (!log || !screen) return;
		const observer = new MutationObserver(() => {
			screen.scrollTop = screen.scrollHeight;
		});
		observer.observe(log, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, []);

	/* ---------- keyboard ---------- */

	const completions = contact || pending ? [] : complete(input);
	const ghost =
		completions.length === 1 && completions[0].startsWith(input)
			? completions[0].slice(input.length)
			: "";

	// A phone shows no caret and opens no keyboard, so nothing would say the line is
	// typeable. Say it, in the exact spot the text will appear. CSS retires it on focus.
	const showTapHint = touch && !input && !contact && !pending;

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (contact) {
				handleContactInput(input);
				setInput("");
			} else if (pending) {
				handlePendingInput(input);
				setInput("");
			} else run(input);
		} else if (e.key === "Tab") {
			e.preventDefault();
			if (completions.length === 1) setInput(completions[0] + " ");
			else if (completions.length > 1) {
				push({
					prompt: input,
					output: (
						<div className="t-ls">
							{completions.map((c) => (
								<Cmd key={c}>{c}</Cmd>
							))}
						</div>
					),
				});
				// Fill in the longest common prefix
				const prefix = completions.reduce((a, b) => {
					let i = 0;
					while (i < a.length && a[i] === b[i]) i++;
					return a.slice(0, i);
				});
				if (prefix.length > input.length) setInput(prefix);
			}
		} else if (
			e.key === "ArrowRight" &&
			ghost &&
			e.currentTarget.selectionStart === input.length
		) {
			e.preventDefault();
			setInput(input + ghost);
		} else if (e.key === "ArrowUp" && !contact && !pending) {
			e.preventDefault();
			if (!history.length) return;
			const idx =
				histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
			setHistIdx(idx);
			setInput(history[idx]);
		} else if (e.key === "ArrowDown" && !contact && !pending) {
			e.preventDefault();
			if (histIdx === null) return;
			const idx = histIdx + 1;
			if (idx >= history.length) {
				setHistIdx(null);
				setInput("");
			} else {
				setHistIdx(idx);
				setInput(history[idx]);
			}
		} else if (e.key === "l" && e.ctrlKey) {
			e.preventDefault();
			setEntries([]);
		} else if (
			(e.key === "c" && e.ctrlKey && !window.getSelection()?.toString()) ||
			(e.key === "Escape" && (contact || pending))
		) {
			e.preventDefault();
			if (pendingRef.current) {
				// The command renders its own cancellation, so just answer it with null.
				const waiting = pendingRef.current;
				setPending(null);
				waiting.onAnswer(null);
			} else {
				push({
					promptLabel: promptLabel ?? undefined,
					prompt: `${input}^C`,
					output: contact ? <Muted>contact cancelled.</Muted> : undefined,
				});
				setContact(null);
			}
			setInput("");
		}
	};

	const focusInput = () => {
		if (!window.getSelection()?.toString()) autoFocus();
	};

	const user = `${profile.handle}@${profile.hostname}`;

	return (
		<TerminalContext.Provider value={api}>
			<div className="t-root" data-theme={theme}>
				<div className="t-window">
					<header className="t-titlebar">
						<div className="t-dots" aria-hidden>
							<span />
							<span />
							<span />
						</div>
						<div className="t-title">{user}: ~</div>
						<button
							type="button"
							className="t-theme-btn"
							onClick={() => {
								const keys = Object.keys(THEMES) as ThemeName[];
								setTheme(keys[(keys.indexOf(theme) + 1) % keys.length]);
							}}
							aria-label="Cycle color theme"
						>
							◐ {theme}
						</button>
					</header>

					<div ref={scrollRef} className="t-screen" onClick={focusInput}>
						<div ref={logRef} role="log" aria-live="polite" className="t-log">
							{entries.map((entry) => (
								<div key={entry.id} className="t-block">
									{entry.prompt !== undefined && (
										<div className="t-line">
											<PromptLabel user={user} label={entry.promptLabel} />
											<span className="t-typed">{entry.prompt}</span>
										</div>
									)}
									{entry.output && (
										<div className="t-output">{entry.output}</div>
									)}
								</div>
							))}
						</div>

						<div className="t-line t-input-line">
							<PromptLabel user={user} label={promptLabel ?? undefined} />
							<div className="t-input-wrap">
								<div className="t-ghost" aria-hidden>
									<span className="t-ghost-typed">{input}</span>
									<span className={showTapHint ? "t-ghost-hint" : undefined}>
										{ghost || (showTapHint ? "tap to type" : "")}
									</span>
								</div>
								<input
									ref={inputRef}
									className="t-input"
									value={input}
									onChange={(e) => {
										setInput(e.target.value);
										setHistIdx(null);
									}}
									onKeyDown={onKeyDown}
									type="text"
									inputMode={contact?.step === "email" ? "email" : "text"}
									aria-label={promptLabel ?? "Terminal command"}
									autoComplete="off"
									autoCapitalize="off"
									autoCorrect="off"
									spellCheck={false}
									enterKeyHint="send"
								/>
							</div>
						</div>
						{contact && (
							<Hint>
								step{" "}
								{(
									["name", "email", "message", "confirm"] as ContactStep[]
								).indexOf(contact.step) + 1}
								/4 · Esc to cancel
							</Hint>
						)}
						{pending && <Hint>answer y or n · Esc to abort</Hint>}
					</div>

					<nav className="t-quickbar" aria-label="Quick commands">
						{QUICK.map((q) => (
							<button key={q} type="button" onClick={() => api.run(q)}>
								{q}
							</button>
						))}
					</nav>
				</div>
			</div>
		</TerminalContext.Provider>
	);
}

function PromptLabel({ user, label }: { user: string; label?: string }) {
	if (label) return <span className="t-prompt t-prompt-alt">{label} ›</span>;
	return (
		<span className="t-prompt">
			<span className="t-prompt-user">{user}</span>
			<span className="t-muted">:</span>
			<span className="t-prompt-path">~</span>
			<span className="t-muted">$</span>
		</span>
	);
}
