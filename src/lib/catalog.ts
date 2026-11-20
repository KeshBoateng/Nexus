/**
 * Built-in learning catalog. Every URL here was fetched on VERIFIED_ON and returned HTTP 200
 * with the expected page (see docs/DECISIONS.md D-011). Durations are only stated where known;
 * otherwise the format is described ("self-paced course") rather than invented.
 * Re-verify before relying on availability: links can change.
 */

export const VERIFIED_ON = '2026-11-20';

export type Track = 'technical' | 'leadership' | 'entrepreneurship';
export type ResourceKind = 'video' | 'course' | 'docs' | 'article' | 'book' | 'exercise' | 'paper' | 'lab';
export type Difficulty = 'intro' | 'intermediate' | 'advanced';

export interface CatalogResource {
  id: string;
  title: string;
  source: string;
  url: string;
  kind: ResourceKind;
  difficulty: Difficulty;
  skills: string[];
  format: string;
  objective: string;
  exercise: string;
}

/** Suggested skills per track (spec §2.3). Catalog items are tagged with these names. */
export const SUGGESTED_SKILLS: Record<Track, string[]> = {
  technical: ['Programming', 'Web development', 'Data structures & algorithms', 'Networking', 'Cybersecurity', 'AI / machine learning', 'Databases', 'System architecture', 'Developer tools'],
  leadership: ['Team leadership', 'Delegation', 'Communication', 'Conflict resolution', 'Decision-making', 'Project management', 'Strategic thinking'],
  entrepreneurship: ['Business models', 'Market validation', 'Customer acquisition', 'Sales', 'Business finance', 'Product development', 'Business strategy'],
};

export const CATALOG: CatalogResource[] = [
  // Technical
  { id: 'cs50x', title: "CS50's Introduction to Computer Science", source: 'Harvard', url: 'https://cs50.harvard.edu/x/', kind: 'course', difficulty: 'intro', skills: ['Programming', 'Data structures & algorithms'], format: 'Self-paced course with problem sets', objective: 'Build solid programming fundamentals in C, Python and SQL.', exercise: 'Complete one problem set and push it to GitHub.' },
  { id: 'missing-semester', title: 'The Missing Semester of Your CS Education', source: 'MIT', url: 'https://missing.csail.mit.edu/', kind: 'course', difficulty: 'intro', skills: ['Developer tools', 'Programming'], format: 'Lecture videos + exercises', objective: 'Use the shell, Git, editors and debugging tools fluently.', exercise: 'Do the exercises for the shell and Git lectures.' },
  { id: 'pro-git', title: 'Pro Git (book)', source: 'git-scm.com', url: 'https://git-scm.com/book/en/v2', kind: 'book', difficulty: 'intro', skills: ['Developer tools'], format: 'Free online book', objective: 'Understand branching, merging and rebasing properly.', exercise: 'Create a repo, branch, cause and resolve a merge conflict.' },
  { id: 'mdn-learn', title: 'Learn web development', source: 'MDN', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development', kind: 'docs', difficulty: 'intro', skills: ['Web development'], format: 'Structured documentation with tasks', objective: 'Learn HTML, CSS and JavaScript from the reference authority.', exercise: 'Build and deploy a one-page site from scratch.' },
  { id: 'odin', title: 'The Odin Project', source: 'The Odin Project', url: 'https://www.theodinproject.com/', kind: 'course', difficulty: 'intro', skills: ['Web development', 'Programming'], format: 'Self-paced full-stack curriculum', objective: 'Go from basics to full-stack JavaScript with real projects.', exercise: 'Finish the next project in your current path.' },
  { id: 'freecodecamp', title: 'freeCodeCamp curriculum', source: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn/', kind: 'course', difficulty: 'intro', skills: ['Web development', 'Programming'], format: 'Interactive lessons + certification projects', objective: 'Practise with immediate feedback and earn free certifications.', exercise: 'Complete one certification project.' },
  { id: 'react-learn', title: 'Learn React', source: 'react.dev', url: 'https://react.dev/learn', kind: 'docs', difficulty: 'intermediate', skills: ['Web development'], format: 'Official tutorial', objective: 'Think in components, state and effects.', exercise: 'Rebuild a small screen of an app you use, in React.' },
  { id: 'ts-handbook', title: 'TypeScript Handbook', source: 'typescriptlang.org', url: 'https://www.typescriptlang.org/docs/handbook/intro.html', kind: 'docs', difficulty: 'intermediate', skills: ['Programming', 'Web development'], format: 'Official handbook', objective: 'Use types to catch bugs before running code.', exercise: 'Convert a small JavaScript project to strict TypeScript.' },
  { id: 'roadmap-sh', title: 'roadmap.sh developer roadmaps', source: 'roadmap.sh', url: 'https://roadmap.sh/', kind: 'article', difficulty: 'intro', skills: ['Web development', 'System architecture', 'Cybersecurity', 'AI / machine learning'], format: 'Visual learning roadmaps', objective: 'See what to learn next and in what order for a role.', exercise: 'Pick a role roadmap and mark what you already know.' },
  { id: 'neetcode', title: 'NeetCode roadmap', source: 'NeetCode', url: 'https://neetcode.io/roadmap', kind: 'exercise', difficulty: 'intermediate', skills: ['Data structures & algorithms'], format: 'Problem roadmap with video solutions', objective: 'Learn interview-style problem patterns in order.', exercise: 'Solve 3 problems from your current roadmap node without looking.' },
  { id: 'mit-6006', title: 'Introduction to Algorithms (6.006)', source: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/', kind: 'course', difficulty: 'advanced', skills: ['Data structures & algorithms'], format: 'University lectures, notes, problem sets', objective: 'Understand algorithm design and analysis rigorously.', exercise: 'Do one problem set and check against the solutions.' },
  { id: 'system-design-primer', title: 'The System Design Primer', source: 'GitHub', url: 'https://github.com/donnemartin/system-design-primer', kind: 'article', difficulty: 'intermediate', skills: ['System architecture'], format: 'Open-source guide', objective: 'Learn how large systems scale: caching, queues, databases.', exercise: 'Sketch the design of an app you use and explain its bottleneck.' },
  { id: 'pg-tutorial', title: 'PostgreSQL tutorial', source: 'postgresql.org', url: 'https://www.postgresql.org/docs/current/tutorial.html', kind: 'docs', difficulty: 'intro', skills: ['Databases'], format: 'Official tutorial', objective: 'Model data and write correct SQL queries.', exercise: 'Design tables for a small shop and query weekly sales.' },
  { id: 'netacad', title: 'Cisco Networking Academy', source: 'Cisco', url: 'https://www.netacad.com/', kind: 'course', difficulty: 'intro', skills: ['Networking', 'Cybersecurity'], format: 'Self-paced courses (free account)', objective: 'Learn networking fundamentals toward CCNA.', exercise: 'Build a small network in Packet Tracer with two VLANs.' },
  { id: 'messer', title: 'Professor Messer — free CompTIA training', source: 'Professor Messer', url: 'https://www.professormesser.com/', kind: 'video', difficulty: 'intro', skills: ['Networking', 'Cybersecurity'], format: 'Free video courses', objective: 'Prepare for Network+ / Security+ level knowledge.', exercise: 'Watch one module and explain subnetting or a protocol to someone.' },
  { id: 'bandit', title: 'OverTheWire: Bandit', source: 'OverTheWire', url: 'https://overthewire.org/wargames/bandit/', kind: 'lab', difficulty: 'intro', skills: ['Cybersecurity', 'Developer tools'], format: 'Hands-on wargame levels', objective: 'Learn Linux and security thinking by solving levels.', exercise: 'Clear the next 3 levels and note the commands you learned.' },
  { id: 'tryhackme', title: 'TryHackMe', source: 'TryHackMe', url: 'https://tryhackme.com/', kind: 'lab', difficulty: 'intro', skills: ['Cybersecurity'], format: 'Guided labs (free tier)', objective: 'Practise offensive and defensive security safely.', exercise: 'Complete one free room end to end.' },
  { id: 'portswigger', title: 'Web Security Academy', source: 'PortSwigger', url: 'https://portswigger.net/web-security', kind: 'lab', difficulty: 'intermediate', skills: ['Cybersecurity', 'Web development'], format: 'Free labs on web vulnerabilities', objective: 'Understand and exploit (legally) the OWASP top issues.', exercise: 'Solve the apprentice SQL injection labs.' },
  { id: 'fastai', title: 'Practical Deep Learning for Coders', source: 'fast.ai', url: 'https://course.fast.ai/', kind: 'course', difficulty: 'intermediate', skills: ['AI / machine learning'], format: 'Free course with notebooks', objective: 'Train useful deep-learning models quickly, then learn the theory.', exercise: 'Train an image classifier on your own small dataset.' },
  { id: 'kaggle-learn', title: 'Kaggle Learn', source: 'Kaggle', url: 'https://www.kaggle.com/learn', kind: 'course', difficulty: 'intro', skills: ['AI / machine learning', 'Programming'], format: 'Short hands-on courses', objective: 'Learn Python, pandas and ML basics with exercises.', exercise: 'Finish one micro-course and submit to a beginner competition.' },
  // Leadership
  { id: 'sinek-ted', title: 'How great leaders inspire action', source: 'TED (Simon Sinek)', url: 'https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action', kind: 'video', difficulty: 'intro', skills: ['Team leadership', 'Communication'], format: 'TED talk', objective: 'Communicate purpose ("why") before plans.', exercise: 'Rewrite your next team message to start with why the work matters.' },
  { id: 'rework', title: 'Google re:Work guides', source: 'Google', url: 'https://rework.withgoogle.com/intl/en/', kind: 'article', difficulty: 'intermediate', skills: ['Team leadership', 'Delegation', 'Decision-making'], format: 'Research-based management guides', objective: 'Apply evidence on effective teams and managers.', exercise: 'Run one team check-in using a re:Work practice.' },
  { id: 'atlassian-playbook', title: 'Atlassian Team Playbook', source: 'Atlassian', url: 'https://www.atlassian.com/team-playbook', kind: 'article', difficulty: 'intro', skills: ['Project management', 'Team leadership', 'Conflict resolution', 'Communication'], format: 'Step-by-step team exercises', objective: 'Run structured kickoffs, retros and roles-and-responsibilities sessions.', exercise: 'Use the "roles and responsibilities" play with your project group.' },
  { id: 'scrum', title: 'What is Scrum?', source: 'Scrum.org', url: 'https://www.scrum.org/learning-series/what-is-scrum', kind: 'article', difficulty: 'intro', skills: ['Project management'], format: 'Learning series', objective: 'Plan work in short cycles with clear ownership.', exercise: 'Run a one-week sprint on a group assignment.' },
  // Entrepreneurship
  { id: 'yc-library', title: 'Y Combinator Startup Library', source: 'Y Combinator', url: 'https://www.ycombinator.com/library', kind: 'article', difficulty: 'intro', skills: ['Business strategy', 'Product development', 'Customer acquisition', 'Sales'], format: 'Essays and talks', objective: 'Learn how successful early-stage startups operate.', exercise: 'Read one piece and write 3 things you would apply.' },
  { id: 'startup-school', title: 'Startup School', source: 'Y Combinator', url: 'https://www.startupschool.org/', kind: 'course', difficulty: 'intro', skills: ['Business strategy', 'Product development', 'Market validation'], format: 'Free online programme', objective: 'Go from idea to launch with a structured curriculum.', exercise: 'Define your idea’s customer and problem in one paragraph.' },
  { id: 'yc-startup-school-videos', title: 'Startup School video series', source: 'Y Combinator', url: 'https://www.ycombinator.com/library/carousel/Startup%20School', kind: 'video', difficulty: 'intro', skills: ['Product development', 'Customer acquisition', 'Sales'], format: 'Video talks', objective: 'Learn from founders about building and selling.', exercise: 'Watch one talk and list one experiment to run this week.' },
  { id: 'pg-essays', title: 'Paul Graham essays', source: 'paulgraham.com', url: 'https://paulgraham.com/articles.html', kind: 'article', difficulty: 'intermediate', skills: ['Business strategy', 'Product development'], format: 'Essays', objective: 'Think clearly about startups, ideas and growth.', exercise: 'Read "How to Get Startup Ideas" and list 5 problems you face.' },
  { id: 'bm-canvas', title: 'The Business Model Canvas', source: 'Strategyzer', url: 'https://www.strategyzer.com/library/the-business-model-canvas', kind: 'article', difficulty: 'intro', skills: ['Business models'], format: 'Guide + template', objective: 'Describe how a business creates, delivers and captures value.', exercise: 'Fill a canvas for a business idea you have.' },
  { id: 'mom-test', title: 'The Mom Test', source: 'Rob Fitzpatrick', url: 'https://www.momtestbook.com/', kind: 'book', difficulty: 'intro', skills: ['Market validation', 'Customer acquisition'], format: 'Book (site has summary)', objective: 'Ask customer questions that reveal the truth, not compliments.', exercise: 'Interview 3 potential customers using its rules.' },
  { id: 'khan-entre', title: 'Entrepreneurship', source: 'Khan Academy', url: 'https://www.khanacademy.org/college-careers-more/entrepreneurship2', kind: 'video', difficulty: 'intro', skills: ['Business strategy', 'Product development'], format: 'Interviews and lessons', objective: 'Hear how founders think about starting and growing.', exercise: 'Watch one interview and note one decision you would copy.' },
  { id: 'khan-finance', title: 'Core finance', source: 'Khan Academy', url: 'https://www.khanacademy.org/economics-finance-domain/core-finance', kind: 'course', difficulty: 'intro', skills: ['Business finance'], format: 'Video lessons', objective: 'Understand interest, cash flow, statements and valuation basics.', exercise: 'Build a simple 12-month cash-flow sheet for an idea.' },
  { id: 'break-even', title: 'Break-even analysis', source: 'Investopedia', url: 'https://www.investopedia.com/terms/b/breakevenanalysis.asp', kind: 'article', difficulty: 'intro', skills: ['Business finance', 'Business models'], format: 'Article', objective: 'Know how many sales you need to cover costs.', exercise: 'Calculate break-even for a small product you could sell on campus.' },
];

const DIFF_RANK: Record<Difficulty, number> = { intro: 1, intermediate: 2, advanced: 3 };

/**
 * Ordered learning plan for a skill, adapted to demonstrated level:
 * at estimate ≥ 2 ("developing"), introductory resources are dropped (spec §7: don't keep
 * recommending basics for what the user has shown they know).
 */
export function learningPlan(skill: string, estimate: number, done: ReadonlySet<string>): CatalogResource[] {
  const minDiff = estimate >= 3 ? 2 : estimate >= 2 ? 2 : 1;
  return CATALOG.filter((r) => r.skills.includes(skill) && !done.has(r.id) && DIFF_RANK[r.difficulty] >= minDiff).sort(
    (a, b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty] || a.title.localeCompare(b.title),
  );
}
