import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import {
	allBlogs,
	allCertificates,
	allEducations,
	allJobs,
	allProjects,
} from "content-collections";
import { marked } from "marked";
import { profile } from "@/data/profile";
import { renderBanner } from "./banner";
import { THEMES, isTheme, type ThemeName } from "./themes";

export interface TerminalApi {
	run: (input: string) => void;
	clear: () => void;
	setTheme: (theme: ThemeName) => void;
	theme: ThemeName;
	history: string[];
	startContact: () => void;
	/** Puts a question on the input line and routes the next answer to `onAnswer` (null if cancelled). */
	ask: (label: string, onAnswer: (value: string | null) => void) => void;
}

export const TerminalContext = createContext<TerminalApi | null>(null);

function useTerminal() {
	const ctx = useContext(TerminalContext);
	if (!ctx) throw new Error("TerminalContext missing");
	return ctx;
}

export interface Command {
	name: string;
	aliases?: string[];
	description: string;
	usage?: string;
	hidden?: boolean;
	complete?: () => string[];
	run: (args: string[], api: TerminalApi) => ReactNode | void;
}

/* ---------- output building blocks ---------- */

export function Cmd({ children, run }: { children: string; run?: string }) {
	const { run: exec } = useTerminal();
	return (
		<button
			type="button"
			className="t-cmd"
			onClick={() => exec(run ?? children)}
		>
			{children}
		</button>
	);
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a
			className="t-link"
			href={href}
			target={href.startsWith("mailto:") ? undefined : "_blank"}
			rel="noreferrer"
		>
			{children}
		</a>
	);
}

function Heading({ children }: { children: ReactNode }) {
	return <div className="t-heading">{children}</div>;
}

function Muted({ children }: { children: ReactNode }) {
	return <span className="t-muted">{children}</span>;
}

function Tags({ tags }: { tags: string[] }) {
	return (
		<div className="t-tags">
			{tags.map((t) => (
				<span key={t} className="t-tag">
					{t}
				</span>
			))}
		</div>
	);
}

function Markdown({ source }: { source: string }) {
	return (
		<div
			className="t-md"
			dangerouslySetInnerHTML={{
				__html: marked.parse(source, { async: false }),
			}}
		/>
	);
}

function Hint({ children }: { children: ReactNode }) {
	return <div className="t-hint">{children}</div>;
}

function ErrorLine({ children }: { children: ReactNode }) {
	return <div className="t-error">{children}</div>;
}

interface StreamLine {
	node: ReactNode;
	/** Extra pause before this line, on top of the stream's base delay (ms). */
	wait?: number;
}

const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Reveals output a line at a time so a command reads as though it were actually running.
 * Silenced for assistive tech: the *outcome* is worth announcing, the scroll isn't.
 */
function Stream({
	lines,
	delay = 150,
	onDone,
}: {
	lines: StreamLine[];
	delay?: number;
	onDone?: () => void;
}) {
	const [count, setCount] = useState(() =>
		prefersReducedMotion() ? lines.length : 1,
	);
	const doneRef = useRef(onDone);
	doneRef.current = onDone;
	const firedRef = useRef(false);

	useEffect(() => {
		if (count >= lines.length) return;
		const timer = setTimeout(
			() => setCount(count + 1),
			delay + (lines[count]?.wait ?? 0),
		);
		return () => clearTimeout(timer);
	}, [count, lines, delay]);

	useEffect(() => {
		if (count < lines.length || firedRef.current) return;
		firedRef.current = true;
		doneRef.current?.();
	}, [count, lines.length]);

	return (
		<div className="space-y-1" aria-live="off">
			{lines.slice(0, count).map((line, i) => (
				<div key={i}>{line.node}</div>
			))}
		</div>
	);
}

/** An answered question, echoed the way the contact flow echoes its own prompts. */
function PromptEcho({ label, value }: { label: string; value: string }) {
	return (
		<div className="t-line">
			<span className="t-prompt t-prompt-alt">{label} ›</span>
			<span className="t-typed">{value}</span>
		</div>
	);
}

/* ---------- data helpers ---------- */

const fmtDate = (d?: string) =>
	d
		? new Date(d).toLocaleDateString("en-US", {
				month: "short",
				year: "numeric",
				timeZone: "UTC",
			})
		: "present";

const jobs = [...allJobs].sort((a, b) =>
	b.startDate.localeCompare(a.startDate),
);
const education = [...allEducations].sort((a, b) =>
	b.startDate.localeCompare(a.startDate),
);
const certificates = [...allCertificates].sort((a, b) =>
	b.startDate.localeCompare(a.startDate),
);
const posts = [...allBlogs].sort((a, b) => b.date.localeCompare(a.date));
const projects = allProjects;
const slug = (path: string) => path.replace(/\.md$/, "");

/** Used for the compact banners: the avatar in about/neofetch and the phone-sized hero. */
const INITIALS = profile.name
	.split(" ")
	.map((w) => w[0])
	.join("");

/** The banner is a fixed-width pre: however wide its longest row is, that is how wide it
 *  renders at any font-size. Hand the column count to CSS so it can solve for a size that
 *  fits the column instead of overflowing it. */
const colsOf = (art: string) =>
	Math.max(...art.split("\n").map((line) => line.length));

function findProject(q: string) {
	const query = q.toLowerCase();
	const byIndex = Number(query);
	if (Number.isInteger(byIndex) && byIndex >= 1) return projects[byIndex - 1];
	return projects.find(
		(p) => p.title.toLowerCase() === query || slug(p._meta.path) === query,
	);
}

function findPost(q: string) {
	const query = q.toLowerCase();
	const byIndex = Number(query);
	if (Number.isInteger(byIndex) && byIndex >= 1) return posts[byIndex - 1];
	return posts.find((p) => slug(p._meta.path) === query);
}

/* ---------- sections ---------- */

export function Banner() {
	const wide = renderBanner(profile.name);
	const narrow = renderBanner(INITIALS);
	// Both banners ship in the SSR output and CSS picks one with a container query, so the
	// boot screen stays deterministic (a matchMedia check here would desync hydration).
	return (
		<div className="t-banner-wrap">
			<pre
				className="t-banner t-banner-wide"
				style={{ "--t-banner-cols": colsOf(wide) } as CSSProperties}
				aria-label={profile.name}
			>
				{wide}
			</pre>
			<pre
				className="t-banner t-banner-narrow"
				style={{ "--t-banner-cols": colsOf(narrow) } as CSSProperties}
				aria-hidden
			>
				{narrow}
			</pre>
			{/* Only visible on narrow columns, where the art above is initials rather than a name. */}
			<div className="t-banner-name">{profile.name}</div>
			<div>
				<span className="t-accent">{profile.role}</span>{" "}
				<Muted>· {profile.location}</Muted>
			</div>
			<div className="t-muted">{profile.tagline}</div>
		</div>
	);
}

export function Welcome() {
	return (
		<div className="space-y-2">
			<Banner />
			<div>
				Welcome! Type <Cmd>help</Cmd> to see what you can do, or jump straight
				to <Cmd>about</Cmd>, <Cmd>projects</Cmd>, <Cmd>experience</Cmd> or{" "}
				<Cmd>contact</Cmd>.
			</div>
			<Hint>
				tip: press Tab to autocomplete, ↑/↓ to browse history. Everything
				highlighted is clickable.
			</Hint>
		</div>
	);
}

function About() {
	return (
		<div className="space-y-2">
			<Heading>~/about</Heading>
			<div className="t-about">
				<div className="t-avatar" aria-hidden>
					{renderBanner(INITIALS)}
				</div>
				<div className="space-y-2">
					{<span className="t-strong">{profile.name}</span>}
					{profile.bio.map((p) => (
						<p key={p}>{p}</p>
					))}
				</div>
			</div>
			<div>
				<Muted>status:</Muted> <span className="t-ok">●</span>{" "}
				{profile.availability}
			</div>
			<Hint>
				next: <Cmd>skills</Cmd> <Cmd>experience</Cmd> <Cmd>projects</Cmd>
			</Hint>
		</div>
	);
}

function Skills() {
	const width = Math.max(...profile.skills.map((s) => s.group.length));
	return (
		<div className="space-y-1">
			<Heading>~/skills</Heading>
			{profile.skills.map((s) => (
				<div key={s.group} className="t-row">
					<span className="t-key">{s.group.padEnd(width)}</span>
					<Tags tags={s.items} />
				</div>
			))}
		</div>
	);
}

function Experience() {
	return (
		<div className="space-y-3">
			<Heading>~/experience</Heading>
			{jobs.map((job) => (
				<div key={job._meta.path} className="t-entry">
					<div>
						<span className="t-accent">{job.jobTitle}</span> @{" "}
						<span className="t-strong">{job.company}</span>
					</div>
					<Muted>
						{fmtDate(job.startDate)} — {fmtDate(job.endDate)} · {job.location}
					</Muted>
					<div>{job.summary}</div>
					<Markdown source={job.content} />
					<Tags tags={job.tags} />
				</div>
			))}
		</div>
	);
}

function Education() {
	return (
		<div className="space-y-3">
			<Heading>~/education</Heading>
			{education.map((e) => (
				<div key={e._meta.path} className="t-entry">
					<div>
						<span className="t-accent">{e.summary}</span> ·{" "}
						<span className="t-strong">{e.school}</span>
					</div>
					<Muted>
						{fmtDate(e.startDate)} — {fmtDate(e.endDate)}
					</Muted>
					<Markdown source={e.content} />
					<Tags tags={e.tags} />
				</div>
			))}
		</div>
	);
}

function Certificates() {
	return (
		<div className="space-y-3">
			<Heading>~/certificates</Heading>
			{certificates.map((c) => (
				<div key={c._meta.path} className="t-entry">
					<div>
						<span className="t-accent">{c.summary}</span> ·{" "}
						<span className="t-strong">{c.school}</span>
					</div>
					<Muted>
						{fmtDate(c.startDate)} — {fmtDate(c.endDate)}
					</Muted>
					<Markdown source={c.content} />
					<Tags tags={c.tags} />
				</div>
			))}
		</div>
	);
}

function Projects() {
	return (
		<div className="space-y-3">
			<Heading>~/projects</Heading>
			{projects.map((p, i) => (
				<div key={p._meta.path} className="t-entry">
					<div>
						<Muted>[{i + 1}]</Muted>{" "}
						<Cmd run={`project ${slug(p._meta.path)}`}>{p.title}</Cmd>{" "}
						<span>— {p.description}</span>
					</div>
					<Tags tags={p.tags} />
				</div>
			))}
			<Hint>
				run <span className="t-accent">project &lt;name|number&gt;</span> for
				details
			</Hint>
		</div>
	);
}

function ProjectDetail({ q }: { q?: string }) {
	if (!q)
		return (
			<ErrorLine>
				usage: project &lt;name|number&gt;. Try <Cmd>projects</Cmd> for a list.
			</ErrorLine>
		);
	const p = findProject(q);
	if (!p)
		return (
			<ErrorLine>
				project not found: {q}. Try <Cmd>projects</Cmd>.
			</ErrorLine>
		);
	return (
		<div className="space-y-2">
			<Heading>~/projects/{slug(p._meta.path)}</Heading>
			<div className="t-strong">{p.description}</div>
			<Markdown source={p.content} />
			<Tags tags={p.tags} />
			<div className="t-row">
				{p.github && (
					<span>
						<Muted>source →</Muted>{" "}
						<Ext href={p.github}>{p.github.replace("https://", "")}</Ext>
					</span>
				)}
				{p.liveUrl && (
					<span>
						<Muted>live →</Muted>{" "}
						<Ext href={p.liveUrl}>{p.liveUrl.replace("https://", "")}</Ext>
					</span>
				)}
			</div>
		</div>
	);
}

function Blog() {
	return (
		<div className="space-y-2">
			<Heading>~/blog</Heading>
			{posts.map((p, i) => (
				<div key={p._meta.path} className="t-entry">
					<div>
						<Muted>
							[{i + 1}] {p.date}
						</Muted>{" "}
						<Cmd run={`read ${slug(p._meta.path)}`}>{p.title}</Cmd>
					</div>
					<div className="t-muted">{p.summary}</div>
				</div>
			))}
			<Hint>
				run <span className="t-accent">read &lt;slug|number&gt;</span> to open a
				post
			</Hint>
		</div>
	);
}

function Post({ q }: { q?: string }) {
	if (!q)
		return (
			<ErrorLine>
				usage: read &lt;slug|number&gt;. Try <Cmd>blog</Cmd> for a list.
			</ErrorLine>
		);
	const p = findPost(q);
	if (!p)
		return (
			<ErrorLine>
				post not found: {q}. Try <Cmd>blog</Cmd>.
			</ErrorLine>
		);
	return (
		<article className="space-y-2 t-article">
			<Heading>{p.title}</Heading>
			<Muted>
				{p.date} · {p.author}
			</Muted>
			<Markdown source={p.content} />
			<Tags tags={p.tags} />
			<Hint>
				back to <Cmd>blog</Cmd>
			</Hint>
		</article>
	);
}

function Socials() {
	return (
		<div className="space-y-1">
			<Heading>~/socials</Heading>
			{profile.socials.map((s) => (
				<div key={s.label} className="t-row">
					<span className="t-key">{s.label.padEnd(9)}</span>
					<Ext href={s.url}>{s.url.replace(/^(https:\/\/|mailto:)/, "")}</Ext>
				</div>
			))}
		</div>
	);
}

function Help({ commands }: { commands: Command[] }) {
	const visible = commands.filter((c) => !c.hidden);
	const width = Math.max(...visible.map((c) => (c.usage ?? c.name).length));
	return (
		<div className="space-y-1">
			<Heading>available commands</Heading>
			{visible.map((c) => (
				<div key={c.name} className="t-row t-help-row">
					<span className="t-help-cmd" style={{ minWidth: `${width + 1}ch` }}>
						<Cmd run={c.name}>{c.usage ?? c.name}</Cmd>
					</span>
					<span className="t-muted">{c.description}</span>
				</div>
			))}
			<Hint>psst… there are a few hidden commands too.</Hint>
		</div>
	);
}

function Neofetch() {
	const rows: [string, string][] = [
		["user", `${profile.handle}@${profile.hostname}`],
		["role", profile.role],
		["location", profile.location],
		["uptime", `${new Date().getFullYear() - 2021} years in the industry`],
		["shell", "shellfolio 1.0"],
		["projects", `${projects.length} shipped`],
		["posts", `${posts.length} published`],
		["stack", profile.skills[1].items.slice(0, 3).join(", ")],
	];
	return (
		<div className="t-about">
			<div className="t-avatar" aria-hidden>
				{renderBanner(INITIALS)}
			</div>
			<div>
				{rows.map(([k, v]) => (
					<div key={k}>
						<span className="t-key">{k.padEnd(9)}</span> {v}
					</div>
				))}
				<div className="t-swatches" aria-hidden>
					{[
						"--t-fg",
						"--t-accent",
						"--t-ok",
						"--t-warn",
						"--t-err",
						"--t-muted",
					].map((v) => (
						<span key={v} style={{ background: `var(${v})` }} />
					))}
				</div>
			</div>
		</div>
	);
}

/* ---------- easter eggs ---------- */
// A local mirror of a real `pacman -Syu`: same phrasing, same column order, same anticlimax.
const UPGRADES = [
	{ pkg: "extra/gta-7", version: "1.0.0-1", size: "186.4 MiB" },
	{ pkg: "extra/halflife-3", version: "1.0.0-1", size: "92.2 MiB" },
	{ pkg: "extra/fusion-reactor", version: "2.6.9-1", size: "14.0 MiB" },
	{ pkg: "extra/coffee-daemon", version: "4.2.0-1", size: "0.4 MiB" },
	{ pkg: "extra/cancer-cure", version: "0.0.3-1", size: "873.8 MiB" },
	{ pkg: "community/sentient-linter", version: "0.1.0-1", size: "3.3 MiB" },
	{ pkg: "community/area51-map", version: "2.0.1-1", size: "20.2 MiB" },
	{ pkg: "multilib/windows-11", version: "24H2-1", size: "6.8 GiB" },
];

const PACMAN_QUESTION = ":: Proceed with installation? [Y/n]";

const PACMAN_ABORT = (
	<div className="t-muted">
		:: operation cancelled — nothing was upgraded. your disk lives to fight
		another day.
	</div>
);

const PACMAN_UPGRADE_HEAD: StreamLine[] = [
	{ node: <Muted>:: Synchronizing package databases...</Muted> },
	{ node: <div className="t-muted">{" core is up to date"}</div> },
	{ node: <div className="t-muted">{" extra is up to date"}</div> },
	{ node: <div className="t-muted">{" multilib is up to date"}</div> },
	{ node: <Muted>:: Starting full system upgrade...</Muted> },
	{ node: <div className="t-muted">resolving dependencies...</div> },
	{ node: <div className="t-muted">looking for conflicting packages...</div> },
	{ node: <Muted>Packages ({UPGRADES.length})</Muted> },
	// Rows, not a padded pre: these names are far too long for a phone-width column.
	...UPGRADES.map((p) => ({
		node: (
			<div className="t-row">
				<span className="t-accent">{p.pkg}</span>
				<Muted>{p.version}</Muted>
				<Muted>{p.size}</Muted>
			</div>
		),
	})),
	{
		node: (
			<div>
				Total Download Size: <span className="t-strong">302.30 MiB</span>
			</div>
		),
	},
	{
		node: (
			<div>
				Total Installed Size: <span className="t-strong">7.09 GiB</span>
			</div>
		),
	},
];

const PACMAN_UPGRADE_TAIL: StreamLine[] = [
	{ node: <div className="t-muted">(6/6) installing windows-11</div> },
	{ node: <div className="t-muted">:: Running post-transaction hooks...</div> },
	{
		node: (
			<div className="t-muted">(1/3) Updating desktop file MIME cache...</div>
		),
	},
	{
		node: (
			<div className="t-muted">
				(2/3) Compiling GTA 7 shaders (this may take a while)
			</div>
		),
	},
	// The long pause lands after the shader line, which is the whole joke.
	{
		node: <div className="t-muted">(3/3) Waking sentient-linter...</div>,
		wait: 1500,
	},
	{
		node: (
			<ErrorLine>
				error: failed to commit transaction (not enough disk space)
			</ErrorLine>
		),
		wait: 500,
	},
	{
		node: (
			<div className="t-error">
				gta-7: requires 240.0 GiB, but only 12.4 GiB is available
			</div>
		),
	},
	{
		node: (
			<div className="t-error">Errors occurred, no packages were upgraded.</div>
		),
		wait: 350,
	},
	{
		node: (
			<Hint>
				hint: try <Cmd run="sudo pacman -S coffee-daemon">coffee-daemon</Cmd> —
				0.4 MiB, always worth it.
			</Hint>
		),
	},
];

/** Streams a pacman-shaped preamble, asks the real y/n, then streams whatever follows. */
function PacmanFlow({
	head,
	tail,
	onNo,
}: {
	head: StreamLine[];
	tail: StreamLine[];
	onNo: ReactNode;
}) {
	const { ask } = useTerminal();
	const [answer, setAnswer] = useState<string | null | undefined>(undefined);
	const answered = answer !== undefined;
	// pacman's convention is [Y/n], so a bare Enter continues.
	const proceed =
		answered &&
		answer !== null &&
		(answer.trim() === "" || /^y(es)?$/i.test(answer.trim()));

	return (
		<div className="space-y-2">
			<Stream
				lines={head}
				onDone={() => ask(PACMAN_QUESTION, (value) => setAnswer(value))}
			/>
			{answered && (
				<>
					<PromptEcho label={PACMAN_QUESTION} value={answer ?? "^C"} />
					{proceed ? <Stream lines={tail} delay={200} /> : onNo}
				</>
			)}
		</div>
	);
}

function PacmanUpdate() {
	return (
		<PacmanFlow
			head={PACMAN_UPGRADE_HEAD}
			tail={PACMAN_UPGRADE_TAIL}
			onNo={PACMAN_ABORT}
		/>
	);
}

/** The other half of pacman: a single install that actually succeeds, so the hint above pays off. */
function PacmanInstall({ pkg }: { pkg: string }) {
	const { head, tail } = useMemo(
		() => ({
			head: [
				{ node: <Muted>:: Synchronizing package databases...</Muted> },
				{ node: <div className="t-muted">{" extra is up to date"}</div> },
				{ node: <Muted>Packages (1) extra/{pkg}</Muted> },
				{
					node: (
						<div>
							Total Download Size: <span className="t-strong">0.4 MiB</span>
						</div>
					),
				},
			] as StreamLine[],
			tail: [
				{ node: <div className="t-muted">(1/1) installing {pkg}</div> },
				{
					node: (
						<div className="t-ok">:: {pkg}.service: started and enabled.</div>
					),
					wait: 500,
				},
				{
					node: (
						<Hint>
							hint: works about as well as the real thing, and downloads far
							faster.
						</Hint>
					),
				},
			] as StreamLine[],
		}),
		[pkg],
	);
	return <PacmanFlow head={head} tail={tail} onNo={PACMAN_ABORT} />;
}

const HTOP = [
	"PID   CPU%  COMMAND",
	"  1    0.0  systemd",
	" 42    2.3  coffee-daemon",
	"237    0.1  portfolio",
	"512   99.9  chrome-47tabs",
	"666    0.0  sentient-lint",
	"808    6.6  npm-install",
].join("\n");

const TRAIN = [
	"       (  ) (  )",
	"        )  (  )",
	"     ___|______|___",
	"    |  _       _   |",
	"    |_|_|-----|_|__|",
	"     (o)       (o)",
].join("\n");

// Shaped so its widest row stays well under the ~28ch a narrow phone gives us.
const COW = [
	"\\   ^__^",
	" \\  (oo)\\_______",
	"    (__)\\       )\\/\\",
	"        ||----w |",
	"        ||     ||",
].join("\n");

/** Speech bubble hard-wrapped to a fixed width so a long message can't blow out the column. */
function Cowsay({ text }: { text: string }) {
	const width = 22;
	const lines: string[] = [];
	for (const word of (text || "moo").split(/\s+/).filter(Boolean)) {
		for (let i = 0; i < word.length; i += width) {
			const chunk = word.slice(i, i + width);
			const prev = lines[lines.length - 1];
			if (i === 0 && prev && prev.length + 1 + chunk.length <= width)
				lines[lines.length - 1] = `${prev} ${chunk}`;
			else lines.push(chunk);
		}
	}
	if (lines.length === 0) lines.push("");
	const w = Math.max(...lines.map((l) => l.length));
	const body = lines.map((l, i) => {
		const pad = l.padEnd(w);
		if (lines.length === 1) return `< ${pad} >`;
		if (i === 0) return `/ ${pad} \\`;
		if (i === lines.length - 1) return `\\ ${pad} /`;
		return `| ${pad} |`;
	});
	const box = [" " + "_".repeat(w + 2), ...body, " " + "-".repeat(w + 2)];
	return <pre className="t-pre">{[...box, COW].join("\n")}</pre>;
}

const FORTUNES = [
	"Weeks of coding can save you hours of planning.",
	"Deleted code is debugged code.",
	"Any sufficiently advanced bug is indistinguishable from a feature.",
	"There are two hard things in computer science: cache invalidation, naming things, and off-by-one errors.",
	"It works on my machine. — every engineer, at some point",
	"The best code is the code you never had to write.",
	"A model trained on the test set is a model that lies politely.",
];

/* ---------- registry ---------- */

const SECTIONS = [
	"about",
	"skills",
	"experience",
	"education",
	"certificates",
	"projects",
	"blog",
	"contact",
	"socials",
];

export const commands: Command[] = [
	{
		name: "help",
		aliases: ["?", "man"],
		description: "list all commands",
		run: () => <Help commands={commands} />,
	},
	{
		name: "about",
		aliases: ["whoami", "bio"],
		description: "who I am and what I do",
		run: () => <About />,
	},
	{
		name: "skills",
		aliases: ["stack", "tech"],
		description: "languages, frameworks, tools",
		run: () => <Skills />,
	},
	{
		name: "experience",
		aliases: ["work", "jobs"],
		description: "where I have worked",
		run: () => <Experience />,
	},
	{
		name: "education",
		aliases: ["edu", "school"],
		description: "degrees",
		run: () => <Education />,
	},
	{
		name: "certificates",
		aliases: ["certs", "certifications"],
		usage: "certificates",
		description: "certs and courses",
		run: () => <Certificates />,
	},
	{
		name: "projects",
		aliases: ["portfolio"],
		description: "things I have built",
		run: () => <Projects />,
	},
	{
		name: "project",
		usage: "project <name>",
		description: "details for a project",
		complete: () => projects.map((p) => slug(p._meta.path)),
		run: (args) => <ProjectDetail q={args[0]} />,
	},
	{
		name: "blog",
		aliases: ["posts", "writing"],
		description: "recent writing",
		run: () => <Blog />,
	},
	{
		name: "read",
		usage: "read <post>",
		description: "read a blog post",
		complete: () => posts.map((p) => slug(p._meta.path)),
		run: (args) => <Post q={args[0]} />,
	},
	{
		name: "resume",
		aliases: ["cv"],
		description: "everything in one go",
		run: () => (
			<div className="space-y-4">
				<Experience />
				<Education />
				<Skills />
			</div>
		),
	},
	{
		name: "contact",
		aliases: ["hire", "message"],
		description: "send me a message",
		run: (_args, api) => {
			api.startContact();
			return (
				<div className="space-y-1">
					<Heading>~/contact</Heading>
					<div>
						Let's talk! Answer a few prompts to send a message. Prefer email?{" "}
						<Ext href={`mailto:${profile.email}`}>{profile.email}</Ext>
					</div>
					<Hint>press Esc or type "cancel" at any time to abort.</Hint>
				</div>
			);
		},
	},
	{
		name: "socials",
		aliases: ["links", "social"],
		description: "find me elsewhere",
		run: () => <Socials />,
	},
	{
		name: "theme",
		usage: "theme <name>",
		description: "change the color scheme",
		complete: () => Object.keys(THEMES),
		run: (args, api) => {
			const name = args[0]?.toLowerCase();
			if (name && isTheme(name)) {
				api.setTheme(name);
				return (
					<div>
						theme set to <span className="t-accent">{name}</span>.
					</div>
				);
			}
			return (
				<div className="space-y-1">
					{name && <ErrorLine>unknown theme: {name}</ErrorLine>}
					{Object.entries(THEMES).map(([key, t]) => (
						<div key={key} className="t-row">
							<span style={{ minWidth: "10ch", display: "inline-block" }}>
								<Cmd run={`theme ${key}`}>{key}</Cmd>
							</span>
							<span className="t-muted">
								{t.description}
								{key === api.theme ? " ← current" : ""}
							</span>
						</div>
					))}
				</div>
			);
		},
	},
	{
		name: "ls",
		aliases: ["dir"],
		description: "list sections",
		run: () => (
			<div className="t-ls">
				{SECTIONS.map((s) => (
					<Cmd key={s} run={s}>{`${s}/`}</Cmd>
				))}
			</div>
		),
	},
	{
		name: "cd",
		usage: "cd <section>",
		description: "open a section",
		hidden: true,
		complete: () => SECTIONS,
		run: (args, api) => {
			const target = args[0]?.replace(/\/$/, "");
			if (!target || target === "~" || target === "..") return <Welcome />;
			if (SECTIONS.includes(target)) return findCommand(target)?.run([], api);
			return <ErrorLine>cd: no such directory: {target}</ErrorLine>;
		},
	},
	{
		name: "pwd",
		hidden: true,
		description: "print working directory",
		run: () => <div>/home/{profile.handle}</div>,
	},
	{
		name: "neofetch",
		aliases: ["fetch", "sysinfo"],
		description: "system info",
		run: () => <Neofetch />,
	},
	{
		name: "banner",
		description: "show the welcome banner",
		run: () => <Welcome />,
	},
	{
		name: "history",
		description: "commands you have run",
		run: (_args, api) => (
			<div>
				{api.history.length === 0 ? (
					<Muted>no history yet</Muted>
				) : (
					api.history.map((h, i) => (
						<div key={i}>
							<Muted>{String(i + 1).padStart(4)}</Muted> <Cmd run={h}>{h}</Cmd>
						</div>
					))
				)}
			</div>
		),
	},
	{
		name: "clear",
		aliases: ["cls"],
		description: "clear the screen",
		run: (_a, api) => api.clear(),
	},
	{
		name: "echo",
		hidden: true,
		description: "print text",
		run: (args) => <div>{args.join(" ")}</div>,
	},
	{
		name: "date",
		hidden: true,
		description: "current date",
		run: () => <div>{new Date().toString()}</div>,
	},
	{
		name: "sudo",
		hidden: true,
		description: "nice try",
		run: (args) => {
			const rest = args.join(" ");
			if (rest.startsWith("pacman")) {
				const flags = args.slice(1);
				if (flags.some((a) => /^-S(y{1,2}u|u)$/.test(a)))
					return <PacmanUpdate />;
				const target = flags[0] === "-S" ? flags[1] : undefined;
				if (target) return <PacmanInstall pkg={target} />;
				return (
					<ErrorLine>error: no targets specified (use -h for help)</ErrorLine>
				);
			}
			if (rest.includes("hire"))
				return (
					<div>
						Permission granted. ✨ Run <Cmd>contact</Cmd> to finalize the
						paperwork.
					</div>
				);
			if (rest.includes("sandwich")) return <div>Okay. 🥪</div>;
			return (
				<ErrorLine>
					{profile.handle} is not in the sudoers file. This incident will be
					reported. (try "sudo hire me")
				</ErrorLine>
			);
		},
	},
	{
		name: "pacman",
		aliases: ["yay", "paru"],
		description: "package manager",
		run: () => (
			<>
				<ErrorLine>
					error: you cannot perform this operation unless you are root.
				</ErrorLine>
				<Hint>
					hint: try <Cmd run="sudo pacman -Syu">sudo pacman -Syu</Cmd>
				</Hint>
			</>
		),
	},
	{
		name: "htop",
		aliases: ["top", "ps"],
		hidden: true,
		description: "process viewer",
		run: () => (
			<div className="space-y-1">
				<pre className="t-pre">{HTOP}</pre>
				<Muted>load avg: 0.42 3.14 6.28</Muted>
				<Hint>
					chrome-47tabs is a known leaker, but it respawns if you kill it.
				</Hint>
			</div>
		),
	},
	{
		name: "sl",
		hidden: true,
		description: "you meant ls",
		run: () => (
			<div className="space-y-1">
				<pre className="t-pre">{TRAIN}</pre>
				<Muted>
					you typed <span className="t-strong">sl</span>, not <Cmd>ls</Cmd>.
					choo choo.
				</Muted>
			</div>
		),
	},
	{
		name: "fortune",
		aliases: ["wisdom"],
		hidden: true,
		description: "unsolicited advice",
		run: () => (
			<div className="t-accent">
				{FORTUNES[Math.floor(Math.random() * FORTUNES.length)]}
			</div>
		),
	},
	{
		name: "cowsay",
		aliases: ["cowthink"],
		hidden: true,
		description: "a cow says things",
		run: (args) => <Cowsay text={args.join(" ")} />,
	},
	{
		name: "rm",
		hidden: true,
		description: "remove files",
		run: () => (
			<ErrorLine>rm: refusing to delete a perfectly good portfolio.</ErrorLine>
		),
	},
	{
		name: "exit",
		aliases: ["quit", "logout"],
		hidden: true,
		description: "leave",
		run: () => (
			<div>
				There is no escape. 🙂 But you can always <Cmd>contact</Cmd> me.
			</div>
		),
	},
	{
		name: "coffee",
		hidden: true,
		description: "brew",
		run: () => (
			<pre className="t-pre">{`   ( (\n    ) )\n  ........\n  |      |]\n  \\      /\n   \`----'   brewing... ☕ ready.`}</pre>
		),
	},
	{
		name: "vim",
		aliases: ["vi", "nano", "emacs"],
		hidden: true,
		description: "editor",
		run: () => (
			<div>
				You're already in the best editor: this one. (hint: :q does nothing
				here)
			</div>
		),
	},
];

const lookup = new Map<string, Command>();
for (const c of commands) {
	lookup.set(c.name, c);
	c.aliases?.forEach((a) => lookup.set(a, c));
}

export function findCommand(name: string) {
	return lookup.get(name.toLowerCase());
}

export function tokenize(input: string) {
	return input.trim().split(/\s+/).filter(Boolean);
}

/** Returns completion candidates for the current input line. */
export function complete(input: string): string[] {
	const endsWithSpace = /\s$/.test(input);
	const parts = tokenize(input);
	if (parts.length === 0) return [];
	if (parts.length === 1 && !endsWithSpace) {
		const q = parts[0].toLowerCase();
		return commands
			.filter((c) => !c.hidden && c.name.startsWith(q))
			.map((c) => c.name);
	}
	const cmd = findCommand(parts[0]);
	if (!cmd?.complete) return [];
	const q = endsWithSpace ? "" : (parts[1] ?? "").toLowerCase();
	return cmd
		.complete()
		.filter((o) => o.startsWith(q))
		.map((o) => `${cmd.name} ${o}`);
}

export function suggest(name: string) {
	const q = name.toLowerCase();
	return commands
		.filter((c) => !c.hidden)
		.find((c) => c.name.startsWith(q.slice(0, 2)))?.name;
}

export { ErrorLine, Hint, Muted };
