// Everything you need to edit to make this site yours: the owner profile and
// site-wide metadata live here.
// Jobs, education, projects and blog posts live as markdown in /content.
//
// This file is imported by both the app and vite.config.ts, so it must stay
// plain data — no React, no browser globals, no secrets (anything here is
// inlined into the public client bundle).

export const profile = {
	name: "John Smith",
	handle: "john",
	hostname: "dev-machine",
	role: "Full-Stack Software Engineer",
	location: "San Francisco, CA",
	email: "john.smith@example.com",
	availability:
		"Available for freelance projects, collaborations, and full-time opportunities.",
	tagline: "Turning coffee into code since 2018.",
	bio: [
		"I'm a software engineer passionate about building useful, scalable, and beautifully designed digital products.",
		"I enjoy working across the stack, from designing intuitive interfaces to building reliable backend systems and infrastructure.",
		"When I'm not coding, you'll probably find me exploring new technologies, contributing to open-source projects, or breaking things just to understand how they work.",
	],
	skills: [
		{
			group: "Languages",
			items: ["TypeScript", "JavaScript", "Python", "Go", "Rust", "SQL"],
		},
		{
			group: "Frontend",
			items: ["React", "Next.js", "Vue", "Tailwind CSS", "HTML", "CSS"],
		},
		{
			group: "Backend",
			items: [
				"Node.js",
				"Express",
				"FastAPI",
				"PostgreSQL",
				"Redis",
				"GraphQL",
			],
		},
		{
			group: "DevOps & Cloud",
			items: [
				"Docker",
				"Kubernetes",
				"AWS",
				"Terraform",
				"GitHub Actions",
				"Linux",
			],
		},
		{
			group: "Tools & Workflow",
			items: ["Git", "Neovim", "VS Code", "Figma", "Jira", "Postman"],
		},
		{
			group: "Other Interests",
			items: [
				"System Design",
				"Open Source",
				"Distributed Systems",
				"Cybersecurity",
			],
		},
	],
	socials: [
		{ label: "github", url: "https://github.com/johnsmith" },
		{ label: "linkedin", url: "https://linkedin.com/in/johnsmith" },
		{ label: "email", url: "mailto:john.smith@example.com" },
		{ label: "telegram", url: "https://t.me/johnsmith" },
	],
};

/** Site-wide metadata: the <title>, the SEO/OG tags, and the browser theme colour. */
export const site = {
	name: profile.name,
	description:
		"John Smith's interactive terminal portfolio. Explore software projects, professional experience, technical skills, and more.",
	themeColor: "#0a0f0a",
};
