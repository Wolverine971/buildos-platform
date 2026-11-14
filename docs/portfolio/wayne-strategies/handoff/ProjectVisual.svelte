<!-- docs/portfolio/wayne-strategies/handoff/ProjectVisual.svelte -->
<script lang="ts">
	let {
		layerId,
		compact = false,
		animated = false
	}: {
		layerId: string;
		compact?: boolean;
		animated?: boolean;
	} = $props();

	const root = '/assets/work/projects/buildos/';
	const labels: Record<string, string> = {
		workspace:
			'BuildOS: a project workspace you can talk to. Actual Fading Crown demo project.',
		conversation:
			'Chat becomes saved work. A scheduling request, visible tool activity, and an actual task-update receipt.',
		'connected-work':
			'Fading Crown project workbench: goals, plans, a real task board, and an illustrative document.',
		sharing:
			'Illustrated project sharing: separate human roles and agent permissions, with an expiring invite link.',
		execution:
			'Illustrated worker lifecycle: queue, claim, saved tool receipts, and browser reconciliation. Actual demo calendar.',
		inkprint:
			'Inkprint design specimens: Paper studio and Ink room, with Bloom, Grain, Thread, and Grid textures.'
	};
	const description = $derived(labels[layerId] ?? labels.workspace);
	const textures = [
		{ name: 'Bloom', meaning: 'Ideas', className: 'bloom' },
		{ name: 'Grain', meaning: 'Execution', className: 'grain' },
		{ name: 'Thread', meaning: 'Relationships', className: 'thread' },
		{ name: 'Grid', meaning: 'Input', className: 'grid' }
	];
</script>

{#snippet wordmark(dark = false)}
	<img
		class="wordmark"
		src={`${root}wordmark-${dark ? 'ink' : 'paper'}.webp`}
		alt="BuildOS"
		width="1200"
		height="360"
	/>
{/snippet}

{#snippet folio(number: string, text: string)}
	<div class="folio"><span>{number} / BUILDOS</span><span>{text}</span></div>
{/snippet}

<div class="stage" role="img" aria-label={description}>
	<div class={['canvas', { compact, animated }]} aria-hidden="true">
		{#if layerId === 'conversation'}
			<div class="chat-view">
				{@render folio('02', 'CONVERSATION → SAVED WORK')}
				<div class="chat-title">
					<span class="square-mark">↗</span>
					<div>
						<small>PROJECT CHAT</small>
						<h2>Fading Crown</h2>
					</div>
					<span class="context-pill">Project context</span>
				</div>
				<div class="bubble">
					<span class="small-label">YOU · DEMO REQUEST</span>
					<p>Move my Ch. 13 writing block<br />to Thursday afternoon.</p>
				</div>
				<div class="tool-strip">
					<span class="check">✓</span>
					<div><small>BUILDOS THOUGHTS</small><strong>Updated task</strong></div>
					<span class="receipt-tag">RECEIPT</span>
				</div>
				<div class="chat-result">
					<span class="task-symbol">✓</span>
					<div>
						<small>WRITING BLOCK</small>
						<h3>Draft Ch. 13</h3>
						<p>Open the task. Inspect the change.</p>
					</div>
					<span class="link-arrow">↗</span>
				</div>
				<div class="source-capture">
					<span class="small-label">ACTUAL PUBLIC DEMO RECEIPT</span><img
						src={`${root}schedule-chat-demo.jpg`}
						alt=""
						width="1040"
						height="178"
					/>
				</div>
				<div class="chat-foot">
					<span class="signal-dot"></span><span
						>Tool activity stays beside the answer.</span
					><span class="micro-note">FADING CROWN / DEMO</span>
				</div>
			</div>
		{:else if layerId === 'connected-work'}
			<div class="workbench">
				{@render folio('03', 'THE PROJECT KEEPS THE CONTEXT')}
				<div class="workbench-title">
					<div>
						<small>PROJECT / FICTIONAL DEMO</small>
						<h2>Fading Crown</h2>
					</div>
					<span class="project-count">TASKS + DOCS</span>
				</div>
				<div class="context-path">
					<span><b>◎</b> Goal</span><i>›</i><span><b>≡</b> Plan</span><i>›</i><span
						class="active-path"><b>✓</b> Task</span
					><i>↔</i><span><b>▤</b> Document</span>
				</div>
				<div class="workbench-body">
					<div class="document-tree">
						<small>PROJECT FILES</small><span class="tree-current"
							>▾ &nbsp; Manuscript</span
						><span>└ &nbsp; Act I</span><span>└ &nbsp; Character notes</span><span
							>└ &nbsp; World &amp; magic</span
						><span class="tree-divider"></span><small>WORK</small><span
							>◎ &nbsp; First draft</span
						><span>≡ &nbsp; Revision plan</span><span class="tree-current"
							>✓ &nbsp; Task board</span
						>
					</div>
					<div class="board-capture">
						<div class="board-heading">
							<strong>Task board</strong><span>THE ACTUAL DEMO</span>
						</div>
						<img src={`${root}task-board-demo.jpg`} alt="" width="980" height="310" />
					</div>
					<div class="document-sheet">
						<span class="document-tab">DOCUMENT / STUDY</span><small
							>PROJECT CONTEXT</small
						>
						<h3>The rules<br />of magic.</h3>
						<p>Magic costs memories.<br />The wards are failing.</p>
						<div class="writing-lines"></div>
						<div class="doc-bottom"><span>▤ Context</span><span>◷ History</span></div>
					</div>
				</div>
				<div class="workbench-foot">
					<span>One project. Connected artifacts.</span><span
						>SCREENSHOT + INTERFACE STUDY</span
					>
				</div>
			</div>
		{:else if layerId === 'sharing'}
			<div class="sharing-view thread">
				{@render folio('04', 'COLLABORATION WITH BOUNDARIES')}
				<div class="share-side">
					<small>PEOPLE + AGENTS</small>
					<h2>Shared work.<br /><em>Clear rights.</em></h2>
					<p>Choose what a person can do.<br />Then choose what their agents can do.</p>
					<div class="permission-key">
						<span>01</span> Person’s role<br /><span>02</span> Their agents’ access
					</div>
				</div>
				<div class="share-sheet">
					<div class="sheet-heading">
						<span class="share-icon">↗</span>
						<div>
							<small>SHARE PROJECT</small>
							<h3>Fading Crown</h3>
						</div>
					</div>
					<div class="share-tabs"><strong>People</strong><span>Invite link</span></div>
					<div class="member-head">
						<span>DEMO ROLE</span><span>PERSON</span><span>AGENTS</span>
					</div>
					<div class="member">
						<span><i>O</i> Project owner</span><b>Owner</b><b class="access-write"
							>Write</b
						>
					</div>
					<div class="member">
						<span><i>E</i> Editorial lead</span><b>Editor</b><b>Read</b>
					</div>
					<div class="member">
						<span><i>R</i> Beta reader</span><b>Viewer</b><b>Off</b>
					</div>
					<div class="invite-strip grid">
						<span class="small-label">INVITE LINK</span><strong
							>Viewer · Agents Read</strong
						><span>Expires after 7 days <b>↗</b></span>
					</div>
					<div class="permission-rule">
						<span>↳</span> Agent Write requires an editing role.
					</div>
				</div>
				<div class="sharing-foot">
					<span>Invite · Set access · Revoke</span><span
						>INTERFACE STUDY / DEMO ROLES</span
					>
				</div>
			</div>
		{:else if layerId === 'execution'}
			<div class="execution-view">
				{@render folio('05', 'WORK OUTLIVES THE BROWSER')}
				<div class="execution-heading">
					<div>
						<small>WORKER-OWNED EXECUTION</small>
						<h2>Still working.</h2>
					</div>
					<span class="runtime-stamp">DURABLE<br />BY DESIGN</span>
				</div>
				<div class="execution-body">
					<div class="work-inbox">
						<h3>Agent work</h3>
						<div class="work-tabs">
							<strong>Recent work</strong><span>Automations</span>
						</div>
						<small>ILLUSTRATIVE RUN</small>
						<div class="run-ticket">
							<span class="signal-dot"></span><strong>Fading Crown</strong>
							<p>Update writing schedule</p>
							<span class="run-state">Result saved</span>
						</div>
						<div class="run-legend"><span>Active</span><span>History</span></div>
					</div>
					<div class="execution-record">
						<span class="small-label">TURN RECORD / EXPLAINED</span>
						<div class="record-row">
							<span>01</span>
							<div>
								<strong>Queued → claimed</strong><small
									>One execution owns the turn</small
								>
							</div>
							<i>✓</i>
						</div>
						<div class="record-row">
							<span>02</span>
							<div>
								<strong>Tool receipt saved</strong><small
									>Result joins the durable record</small
								>
							</div>
							<i>✓</i>
						</div>
						<div class="record-row">
							<span>03</span>
							<div>
								<strong>Browser reconnects</strong><small
									>Reconcile saved text + events</small
								>
							</div>
							<i>↻</i>
						</div>
					</div>
				</div>
				<div class="calendar-strip">
					<div>
						<small>CONNECTED WORK</small><strong>Project events ↔ Calendar</strong
						><span>Separate background sync jobs</span>
					</div>
					<img src={`${root}calendar-demo.jpg`} alt="" width="974" height="344" />
				</div>
				<div class="execution-foot">WORKER LIFECYCLE / ILLUSTRATED</div>
			</div>
		{:else if layerId === 'inkprint'}
			<div class="inkprint-view">
				{@render folio('06', 'INKPRINT / DESIGN SYSTEM')}
				<div class="inkprint-heading">
					<h2>Feels like a<br /><em>place to work.</em></h2>
					<span class="edition"
						>PAPER + INK<br />SEMANTIC TEXTURES<br />SURFACE WEIGHTS</span
					>
				</div>
				<div class="theme-pair">
					<div class="theme-paper grid">
						{@render wordmark()}<span class="theme-label">01 / PAPER STUDIO</span>
						<div class="theme-task">
							<span>✓</span><strong>Make the next move.</strong><span
								class="mini-state">In progress</span
							>
						</div>
					</div>
					<div class="theme-ink grid">
						{@render wordmark(true)}<span class="theme-label">02 / INK ROOM</span>
						<div class="theme-task">
							<span>✓</span><strong>Keep the context.</strong><span class="mini-state"
								>In progress</span
							>
						</div>
					</div>
				</div>
				<div class="texture-row">
					{#each textures as texture (texture.name)}<div class="texture-specimen">
							<div class={['texture-swatch', texture.className]}></div>
							<strong>{texture.name}</strong><span>{texture.meaning}</span>
						</div>{/each}
				</div>
				<div class="inkprint-foot">
					<span>One canonical token system.</span><span class="native-note"
						>NATIVE APP / IN DEVELOPMENT</span
					>
				</div>
			</div>
		{:else}
			<div class="workspace-view">
				{@render folio('01', 'A PROJECT WORKSPACE YOU CAN TALK TO')}
				<div class="workspace-copy">
					{@render wordmark()}
					<h2>Messy thinking.<br /><em>Structured work.</em></h2>
					<p>The project remembers what matters.</p>
				</div>
				<div class="workspace-capture">
					<div class="window-strip">
						<span class="window-dots">● ● ●</span><span>FADING CROWN / PUBLIC DEMO</span
						><span>↗</span>
					</div>
					<img src={`${root}project-demo.jpg`} alt="" width="1010" height="500" />
				</div>
				<div class="workspace-note">
					<span class="note-arrow">↳</span>
					<div>
						<strong>Real work, in one place.</strong><span
							>Tasks · Documents · Project context</span
						>
					</div>
				</div>
				<div class="workspace-stamp">
					ROUGH IDEA<br /><span>↓</span><br />WORKING PROJECT
				</div>
				<div class="workspace-foot">
					<span>BUILDOS</span><span>ACTUAL DEMO / AUGUST 2026</span>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.stage {
		width: 100%;
		height: 100%;
		aspect-ratio: 16 / 10;
		container-type: inline-size;
		overflow: hidden;
		background: #eeece7;
		isolation: isolate;
	}
	.canvas {
		--paper: #faf9f6;
		--ink: #18181c;
		--accent: #b85414;
		--muted: #6a6864;
		--edge: #d4d1c9;
		font:
			1.6666667cqw/1.35 Arial,
			Helvetica,
			sans-serif;
		color: var(--ink);
		width: 100%;
		height: 100%;
		overflow: hidden;
		text-align: left;
		position: relative;
	}
	.canvas *,
	.canvas *::before,
	.canvas *::after {
		box-sizing: border-box;
	}
	h2,
	h3,
	p {
		margin: 0;
	}
	h2 {
		font-size: 3.5em;
		line-height: 1.05;
		letter-spacing: -0.055em;
		font-weight: 700;
	}
	h3 {
		font-size: 2em;
		line-height: 1.1;
		letter-spacing: -0.035em;
	}
	em {
		font-style: normal;
		color: var(--accent);
	}
	small,
	.small-label {
		display: block;
		font:
			0.86em/1.4 ui-monospace,
			SFMono-Regular,
			Menlo,
			monospace;
		letter-spacing: 0.065em;
		color: var(--muted);
	}
	img {
		display: block;
		max-width: 100%;
		height: auto;
	}
	.wordmark {
		width: 12em;
		margin-left: -1em;
	}
	.folio {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font:
			0.82em/1 ui-monospace,
			SFMono-Regular,
			Menlo,
			monospace;
		letter-spacing: 0.08em;
		padding-bottom: 1.3em;
		border-bottom: 1px solid var(--edge);
	}
	.workspace-view,
	.chat-view,
	.workbench,
	.sharing-view,
	.execution-view,
	.inkprint-view {
		position: relative;
		height: 100%;
		padding: 2.2em 2.6em;
		overflow: hidden;
	}
	.workspace-view {
		background:
			radial-gradient(circle, #18181c10 0.065em, transparent 0.08em) right top / 0.75em 0.75em,
			#eeece7;
	}
	.workspace-copy {
		margin-top: 1.4em;
	}
	.workspace-copy h2 {
		font-size: 3.7em;
	}
	.workspace-copy p {
		margin-top: 0.55em;
		font-size: 1.15em;
		color: #58554f;
	}
	.workspace-capture {
		position: absolute;
		width: 41em;
		left: 15.6em;
		top: 19em;
		background: var(--paper);
		border: 1px solid #c4bfb5;
		border-radius: 0.65em;
		overflow: hidden;
		transform: rotate(-3deg);
		box-shadow: 0 1.1em 2em -1em #18181c60;
	}
	.window-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.8em 1.2em;
		border-bottom: 1px solid var(--edge);
		font:
			0.7em/1.1 ui-monospace,
			monospace;
	}
	.window-dots {
		letter-spacing: 0.2em;
		color: #8f8980;
	}
	.workspace-note {
		position: absolute;
		left: 2.6em;
		top: 27em;
		display: flex;
		gap: 0.8em;
		width: 11em;
	}
	.workspace-note strong {
		font-size: 1.35em;
		line-height: 1.15;
		display: block;
	}
	.workspace-note div > span {
		font-size: 0.9em;
		display: block;
		margin-top: 0.5em;
		color: var(--muted);
	}
	.note-arrow {
		font-size: 2.7em;
		line-height: 0.8;
		color: var(--accent);
	}
	.workspace-stamp {
		position: absolute;
		right: 3.8em;
		top: 6em;
		color: var(--accent);
		border: 1px solid currentColor;
		padding: 1em 1.5em;
		font:
			0.8em/1.5 ui-monospace,
			monospace;
		text-align: center;
		transform: rotate(5deg);
	}
	.workspace-stamp span {
		font-size: 1.7em;
	}
	.workspace-foot,
	.workbench-foot,
	.sharing-foot,
	.inkprint-foot {
		position: absolute;
		bottom: 1.8em;
		left: 2.6em;
		right: 2.6em;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font:
			0.8em/1.2 ui-monospace,
			monospace;
	}
	.chat-view {
		background: #f9f8f5;
	}
	.chat-title {
		position: absolute;
		top: 5em;
		left: 2.6em;
		right: 2.6em;
		display: flex;
		align-items: center;
		gap: 1em;
	}
	.chat-title h2 {
		font-size: 2em;
	}
	.square-mark {
		width: 2.8em;
		height: 2.8em;
		display: grid;
		place-items: center;
		background: var(--ink);
		color: #faf9f6;
		font-size: 1.25em;
		border-radius: 0.35em;
	}
	.context-pill {
		margin-left: auto;
		font-size: 1em;
		border: 1px solid var(--edge);
		padding: 0.45em 0.8em;
		border-radius: 2em;
	}
	.bubble {
		position: absolute;
		top: 9.5em;
		right: 2.6em;
		width: 42em;
		padding: 1em 1.6em;
		background: #eee4d9;
		border: 1px solid #dec5af;
		border-radius: 1.3em 1.3em 0.2em 1.3em;
	}
	.bubble p {
		margin-top: 0.3em;
		font-size: 1.8em;
		letter-spacing: -0.025em;
		line-height: 1.25;
	}
	.tool-strip {
		position: absolute;
		top: 18em;
		left: 2.6em;
		right: 2.6em;
		background: #efeee9;
		border: 1px solid var(--edge);
		display: flex;
		align-items: center;
		gap: 1em;
		padding: 0.8em 1.2em;
		border-radius: 0.5em;
	}
	.check {
		color: #267344;
		font-size: 1.8em;
	}
	.tool-strip strong {
		display: block;
		font-size: 1.25em;
	}
	.receipt-tag {
		margin-left: auto;
		font:
			0.8em/1 ui-monospace,
			monospace;
		color: #267344;
	}
	.chat-result {
		position: absolute;
		top: 23.2em;
		left: 2.6em;
		right: 2.6em;
		display: flex;
		gap: 1.2em;
		align-items: center;
		padding: 0.8em 1.2em;
		border: 1px solid var(--edge);
		box-shadow: 0 0.3em 0.7em #18181c08;
		border-radius: 0.5em;
		background: #fffefa;
	}
	.chat-result h3 {
		font-size: 2.1em;
		margin: 0.15em 0;
	}
	.chat-result p {
		color: var(--muted);
		font-size: 1em;
	}
	.task-symbol {
		font-size: 2em;
		color: #287749;
		border: 1px solid #bccebe;
		border-radius: 0.25em;
		width: 1.6em;
		height: 1.6em;
		text-align: center;
	}
	.link-arrow {
		margin-left: auto;
		font-size: 2em;
		color: var(--accent);
	}
	.source-capture {
		position: absolute;
		top: 30.3em;
		left: 2.6em;
		right: 2.6em;
	}
	.source-capture > span {
		font-size: 0.65em;
		margin-bottom: 0.5em;
	}
	.source-capture img {
		width: 100%;
		height: 3.6em;
		object-fit: cover;
		object-position: bottom;
		border: 1px solid var(--edge);
		border-radius: 0.35em;
	}
	.chat-foot {
		position: absolute;
		bottom: 1.2em;
		left: 2.6em;
		right: 2.6em;
		display: flex;
		align-items: center;
		gap: 0.6em;
		font-size: 0.85em;
	}
	.signal-dot {
		flex-shrink: 0;
		display: inline-block;
		background: #277b4c;
		width: 0.65em;
		height: 0.65em;
		border-radius: 50%;
	}
	.micro-note {
		margin-left: auto;
		font:
			0.7em ui-monospace,
			monospace;
		color: var(--muted);
	}
	.workbench {
		background: #e7e5df;
	}
	.workbench-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 1.5em 0;
	}
	.workbench-title h2 {
		font-size: 3em;
		margin-top: 0.2em;
	}
	.project-count {
		padding: 0.55em 0.8em;
		border: 1px solid #bbb6ab;
		font:
			0.9em ui-monospace,
			monospace;
	}
	.context-path {
		display: flex;
		align-items: center;
		gap: 1.2em;
		background: #fbfaf7;
		border: 1px solid var(--edge);
		border-radius: 0.5em 0.5em 0 0;
		padding: 1em 1.4em;
	}
	.context-path span {
		font-size: 1.2em;
		white-space: nowrap;
	}
	.context-path b {
		color: var(--accent);
		margin-right: 0.3em;
	}
	.context-path i {
		color: #aaa396;
		font-style: normal;
	}
	.active-path {
		font-weight: 700;
	}
	.workbench-body {
		height: 21em;
		background: #f4f2ed;
		position: relative;
		border: 1px solid var(--edge);
		border-top: 0;
	}
	.document-tree {
		position: absolute;
		width: 13.7em;
		inset: 0 auto 0 0;
		padding: 1.5em 1em;
		border-right: 1px solid var(--edge);
		display: flex;
		flex-direction: column;
		gap: 0.65em;
		font-size: 0.95em;
		background: #ebe9e3;
	}
	.document-tree small {
		font-size: 0.7em;
	}
	.tree-current {
		font-weight: 700;
	}
	.tree-divider {
		border-top: 1px solid #ccc6bc;
		margin: 0.5em 0;
	}
	.board-capture {
		position: absolute;
		top: 1.1em;
		left: 14em;
		width: 38.5em;
	}
	.board-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 0.5em 0.8em;
	}
	.board-heading strong {
		font-size: 1.4em;
	}
	.board-heading span {
		font:
			0.6em ui-monospace,
			monospace;
		color: var(--muted);
	}
	.board-capture img {
		border: 1px solid var(--edge);
		border-radius: 0.4em;
		width: 100%;
	}
	.document-sheet {
		position: absolute;
		right: 1.5em;
		top: 6.5em;
		width: 23em;
		background: #fffdf7;
		padding: 1.2em 1.8em 1em;
		box-shadow: 0 0.5em 1.4em #18181c25;
		border: 1px solid #c9c2b5;
		transform: rotate(3deg);
	}
	.document-tab {
		position: absolute;
		top: -1.7em;
		right: 0;
		background: #b85414;
		color: white;
		padding: 0.35em 0.8em;
		font:
			0.7em ui-monospace,
			monospace;
	}
	.document-sheet h3 {
		font-family: Georgia, serif;
		font-size: 2.2em;
		line-height: 1;
		margin: 0.3em 0;
		font-weight: 400;
	}
	.document-sheet p {
		font:
			1em/1.5 Georgia,
			serif;
		color: #635c51;
	}
	.writing-lines {
		width: 80%;
		height: 1em;
		margin-top: 0.3em;
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 0.75em,
			#d6d0c3 0.75em,
			#d6d0c3 0.8em
		);
	}
	.doc-bottom {
		display: flex;
		gap: 1.2em;
		margin-top: 0.6em;
		padding-top: 0.7em;
		border-top: 1px solid var(--edge);
		font-size: 0.75em;
		color: #70685c;
	}
	.sharing-view {
		background-color: #eeeae2;
	}
	.share-side {
		position: absolute;
		left: 2.6em;
		top: 7em;
		width: 21em;
	}
	.share-side h2 {
		font-size: 3.1em;
		margin: 0.35em 0 0.5em;
	}
	.share-side p {
		font-size: 1.1em;
		line-height: 1.5;
		color: #635d54;
	}
	.permission-key {
		font-size: 1.05em;
		line-height: 2.4;
		margin-top: 2em;
	}
	.permission-key > span {
		font:
			0.8em ui-monospace,
			monospace;
		padding: 0.4em;
		background: #ded7cb;
		color: #655c4e;
		margin-right: 0.55em;
	}
	.share-sheet {
		position: absolute;
		top: 5.4em;
		left: 24.3em;
		width: 33em;
		border: 1px solid #c7c0b3;
		border-radius: 0.7em;
		background: #fbfaf6;
		padding: 1.5em;
		box-shadow: 0 0.8em 1.8em #30271920;
		transform: rotate(1deg);
	}
	.sheet-heading {
		display: flex;
		align-items: center;
		gap: 0.9em;
		padding-bottom: 0.9em;
	}
	.sheet-heading small {
		font-size: 0.7em;
	}
	.sheet-heading h3 {
		font-size: 1.8em;
	}
	.share-icon {
		font-size: 2.2em;
		color: var(--accent);
	}
	.share-tabs {
		display: flex;
		gap: 2em;
		font-size: 1em;
		border-bottom: 1px solid var(--edge);
		padding: 0.5em 0.2em 0.8em;
		margin-bottom: 1em;
	}
	.share-tabs strong {
		color: var(--accent);
	}
	.member-head,
	.member {
		display: grid;
		grid-template-columns: 1fr 4.5em 3.8em;
		align-items: center;
		gap: 0.5em;
	}
	.member-head {
		font:
			0.65em ui-monospace,
			monospace;
		grid-template-columns: 1fr 6.9em 5.85em;
		color: var(--muted);
		padding-bottom: 0.7em;
	}
	.member {
		font-size: 0.95em;
		padding: 0.75em 0;
		border-bottom: 1px solid #e3dfd6;
	}
	.member > span {
		display: flex;
		align-items: center;
		gap: 0.65em;
	}
	.member i {
		width: 2em;
		height: 2em;
		display: grid;
		place-items: center;
		font:
			0.85em Georgia,
			serif;
		border-radius: 50%;
		background: #e5dfd3;
	}
	.member b {
		font-size: 0.85em;
		font-weight: 400;
		border: 1px solid #d3cec3;
		border-radius: 0.25em;
		text-align: center;
		padding: 0.3em 0.2em;
		background: #f0eee7;
	}
	.member .access-write {
		background: #f5e3d4;
		color: #9b4512;
		border-color: #dec1aa;
	}
	.invite-strip {
		padding: 0.8em;
		margin-top: 0.8em;
		border: 1px solid #c8c1b5;
		border-radius: 0.35em;
		background-color: #eeebe4;
	}
	.invite-strip strong {
		display: block;
		font-size: 1.2em;
		margin: 0.35em 0;
	}
	.invite-strip > span:last-child {
		display: flex;
		justify-content: space-between;
		color: #655d50;
		font-size: 0.9em;
	}
	.permission-rule {
		display: flex;
		gap: 0.5em;
		margin-top: 1em;
		color: #70685c;
		font-size: 0.8em;
	}
	.execution-view {
		background: #f5f3ed;
	}
	.execution-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 1em 0;
	}
	.execution-heading h2 {
		font-size: 3.2em;
	}
	.runtime-stamp {
		font:
			0.8em/1.3 ui-monospace,
			monospace;
		color: var(--accent);
		border: 1px solid currentColor;
		padding: 0.6em 0.9em;
		transform: rotate(4deg);
	}
	.execution-body {
		display: grid;
		grid-template-columns: 21em 1fr;
		border: 1px solid var(--edge);
		background: #fcfbf8;
		border-radius: 0.5em;
		height: 16.3em;
		overflow: hidden;
	}
	.work-inbox {
		padding: 1.2em;
		border-right: 1px solid var(--edge);
		background: #ebe8df;
	}
	.work-inbox h3 {
		font-size: 1.6em;
	}
	.work-tabs {
		display: flex;
		gap: 1em;
		margin: 0.8em 0 1em;
		padding-bottom: 0.7em;
		border-bottom: 1px solid #cfc8ba;
		font-size: 0.75em;
	}
	.work-inbox > small {
		font-size: 0.65em;
	}
	.run-ticket {
		position: relative;
		padding: 1em;
		margin: 0.5em 0;
		border: 1px solid #c9c4b8;
		border-left: 0.3em solid #267344;
		background: #fffefa;
		border-radius: 0.3em;
	}
	.run-ticket > strong {
		font-size: 1.2em;
		margin-left: 0.3em;
	}
	.run-ticket p {
		font-size: 0.9em;
		margin: 0.4em 0;
	}
	.run-state {
		font:
			0.7em ui-monospace,
			monospace;
		color: #267344;
	}
	.run-legend {
		display: flex;
		justify-content: space-between;
		color: #6d6558;
		font-size: 0.8em;
	}
	.execution-record {
		padding: 1.4em 1.7em;
	}
	.execution-record > .small-label {
		font-size: 0.7em;
		margin-bottom: 0.5em;
	}
	.record-row {
		display: flex;
		gap: 1em;
		align-items: center;
		padding: 0.65em 0;
		border-bottom: 1px dashed #d2cbbb;
	}
	.record-row > span {
		font:
			0.8em ui-monospace,
			monospace;
		color: #9a8c75;
	}
	.record-row strong {
		font-size: 1.2em;
	}
	.record-row small {
		font-size: 0.75em;
		margin-top: 0.3em;
		letter-spacing: 0;
	}
	.record-row i {
		margin-left: auto;
		font-style: normal;
		color: #267344;
		font-size: 1.2em;
	}
	.calendar-strip {
		display: grid;
		grid-template-columns: 1fr 22em;
		gap: 1em;
		margin-top: 1em;
		background: #25231f;
		color: #f7f4ed;
		height: 6em;
		overflow: hidden;
		border-radius: 0.45em;
		padding: 0.7em 1.3em;
	}
	.calendar-strip small {
		color: #c1b3a1;
		font-size: 0.7em;
	}
	.calendar-strip strong {
		display: block;
		font-size: 1.45em;
		margin: 0.25em 0;
	}
	.calendar-strip div > span {
		font-size: 0.8em;
		color: #c7bcae;
	}
	.calendar-strip img {
		width: 100%;
		border-radius: 0.25em;
	}
	.execution-foot {
		margin-top: 0.8em;
		font:
			0.65em ui-monospace,
			monospace;
		color: #6a6258;
		text-align: right;
	}
	.inkprint-view {
		background: #eeece5;
	}
	.inkprint-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 1.5em 0;
	}
	.inkprint-heading h2 {
		font:
			3.4em/0.98 Georgia,
			serif;
		letter-spacing: -0.05em;
	}
	.inkprint-heading em {
		font-style: italic;
	}
	.edition {
		font:
			0.8em/1.7 ui-monospace,
			monospace;
		color: #746a5b;
		text-align: right;
	}
	.theme-pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.2em;
	}
	.theme-paper,
	.theme-ink {
		padding: 1.6em;
		height: 12em;
		border: 1px solid #d0c9bc;
		border-radius: 0.4em;
	}
	.theme-paper {
		background-color: #faf9f6;
		box-shadow: 0 0.5em 0.9em -0.7em #18181c50;
	}
	.theme-ink {
		background-color: #1d1c1a;
		color: #ebe9e3;
		border-color: #38352f;
	}
	.theme-pair .wordmark {
		width: 10em;
		margin-top: -0.8em;
		margin-bottom: 0.5em;
	}
	.theme-label {
		display: block;
		font:
			0.7em ui-monospace,
			monospace;
		letter-spacing: 0.1em;
		margin-bottom: 1.3em;
	}
	.theme-task {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6em;
		align-items: center;
		padding: 0.8em;
		border: 1px solid #ccc5b6;
		background: #f0eee8;
		border-radius: 0.3em;
	}
	.theme-task > span:first-child {
		color: #267344;
	}
	.theme-task strong {
		font-size: 1.1em;
	}
	.mini-state {
		display: block;
		margin-left: 1.9em;
		width: 100%;
		font:
			0.65em ui-monospace,
			monospace;
		color: #876045;
	}
	.theme-ink .theme-task {
		background: #292621;
		border-color: #51483b;
	}
	.theme-ink .theme-task > span:first-child {
		color: #81c29b;
	}
	.theme-ink .mini-state {
		color: #f3a46d;
	}
	.texture-row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.2em;
		margin-top: 1.6em;
	}
	.texture-swatch {
		height: 4em;
		border: 1px solid #cec6b7;
		background-color: #e7dfd2;
	}
	.texture-specimen strong {
		display: block;
		font-size: 1.2em;
		margin-top: 0.4em;
	}
	.texture-specimen > span {
		font:
			0.8em ui-monospace,
			monospace;
		color: #716758;
	}
	.bloom {
		background-image: radial-gradient(circle, #18181c2b 0.08em, transparent 0.09em);
		background-size: 0.8em 0.8em;
	}
	.grain {
		background-image: repeating-linear-gradient(
			45deg,
			transparent,
			transparent 0.2em,
			#18181c1a 0.2em,
			#18181c1a 0.3em
		);
	}
	.thread {
		background-image:
			repeating-linear-gradient(
				45deg,
				transparent,
				transparent 0.4em,
				#18181c0a 0.4em,
				#18181c0a 0.5em
			),
			repeating-linear-gradient(
				-45deg,
				transparent,
				transparent 0.4em,
				#18181c0a 0.4em,
				#18181c0a 0.5em
			);
	}
	.grid {
		background-image:
			linear-gradient(#88806d10 1px, transparent 1px),
			linear-gradient(90deg, #88806d10 1px, transparent 1px);
		background-size: 0.8em 0.8em;
	}
	.native-note {
		color: #8b4b23;
	}
	/* Small sheets deliberately change hierarchy; no miniature tables to decipher. */
	.compact .folio {
		font-size: 1.2em;
		border: 0;
	}
	.compact .folio span:last-child {
		display: none;
	}
	.workspace-foot {
		display: none;
	}
	.compact .workspace-copy h2 {
		font-size: 4.3em;
	}
	.compact .workspace-copy p,
	.compact .workspace-note,
	.compact .workspace-stamp,
	.compact .workspace-foot {
		display: none;
	}
	.compact .workspace-capture {
		top: 22em;
		left: 5em;
		width: 53em;
	}
	.compact .workspace-copy .wordmark {
		width: 16em;
	}
	.compact .chat-title h2 {
		font-size: 3em;
	}
	.compact .context-pill,
	.compact .source-capture,
	.compact .chat-foot {
		display: none;
	}
	.compact .bubble {
		top: 11.2em;
		left: 2.6em;
		right: 2.6em;
		width: auto;
		padding: 1.3em;
	}
	.compact .bubble p {
		font-size: 2.4em;
	}
	.compact .bubble .small-label {
		font-size: 1.1em;
	}
	.compact .tool-strip {
		top: 22.5em;
		padding: 0.8em 1.2em;
	}
	.compact .tool-strip strong {
		font-size: 2.2em;
	}
	.compact .tool-strip small {
		font-size: 1.1em;
	}
	.compact .receipt-tag {
		font-size: 1.2em;
	}
	.compact .chat-result {
		top: 29em;
	}
	.compact .chat-result h3 {
		font-size: 2.4em;
	}
	.compact .chat-result small,
	.compact .chat-result p {
		font-size: 1.1em;
	}
	.compact .workbench-title {
		margin: 1em 0;
	}
	.compact .workbench-title h2 {
		font-size: 4em;
	}
	.compact .workbench-title small {
		font-size: 1.1em;
	}
	.compact .project-count,
	.compact .document-tree,
	.compact .workbench-foot,
	.compact .document-sheet p,
	.compact .writing-lines,
	.compact .doc-bottom {
		display: none;
	}
	.compact .context-path {
		gap: 1em;
		padding: 0.8em 1em;
	}
	.compact .context-path span {
		font-size: 1.8em;
	}
	.compact .context-path b {
		display: none;
	}
	.compact .workbench-body {
		height: 20em;
	}
	.compact .board-capture {
		left: 0.7em;
		width: 52em;
		top: 1em;
	}
	.compact .board-heading strong {
		font-size: 2em;
	}
	.compact .board-heading span {
		font-size: 1em;
	}
	.compact .document-sheet {
		top: 8em;
		width: 24em;
		padding: 1.2em;
	}
	.compact .document-sheet h3 {
		font-size: 3em;
	}
	.compact .document-tab {
		font-size: 1em;
	}
	.compact .share-side {
		top: 5em;
		width: 100%;
	}
	.compact .share-side h2 {
		font-size: 4.3em;
	}
	.compact .share-side h2 br {
		display: none;
	}
	.compact .share-side h2 em {
		display: block;
	}
	.compact .share-side > small,
	.compact .share-side p,
	.compact .permission-key,
	.compact .sheet-heading,
	.compact .share-tabs,
	.compact .invite-strip,
	.compact .permission-rule,
	.compact .sharing-foot {
		display: none;
	}
	.compact .share-sheet {
		top: 16.7em;
		left: 2.6em;
		width: 54.8em;
		padding: 1.8em;
	}
	.compact .member {
		font-size: 1.6em;
		padding: 0.6em 0;
	}
	.compact .member-head {
		font-size: 1em;
	}
	.compact .execution-heading h2 {
		font-size: 4.6em;
	}
	.compact .execution-heading small {
		font-size: 1.2em;
	}
	.compact .runtime-stamp,
	.compact .work-inbox,
	.compact .calendar-strip,
	.compact .execution-foot {
		display: none;
	}
	.compact .execution-body {
		display: block;
		height: auto;
	}
	.compact .execution-record {
		padding: 1.3em;
	}
	.compact .execution-record > .small-label {
		font-size: 1em;
	}
	.compact .record-row {
		padding: 1em 0;
		gap: 1.7em;
	}
	.compact .record-row > span {
		font-size: 1.3em;
	}
	.compact .record-row strong {
		font-size: 2.8em;
	}
	.compact .record-row small {
		display: none;
	}
	.compact .inkprint-heading h2 {
		font-size: 4.5em;
	}
	.compact .edition,
	.compact .theme-task,
	.compact .inkprint-foot {
		display: none;
	}
	.compact .theme-paper,
	.compact .theme-ink {
		height: 9em;
		padding: 1.7em;
	}
	.compact .theme-pair .wordmark {
		width: 20em;
	}
	.compact .theme-label {
		font-size: 1.1em;
	}
	.compact .texture-swatch {
		height: 5em;
	}
	.compact .texture-specimen strong {
		font-size: 1.7em;
	}
	.compact .texture-specimen > span {
		display: none;
	}
	@media (prefers-reduced-motion: no-preference) {
		.animated > div {
			animation: sheet-arrive 320ms ease-out both;
		}
	}
	@keyframes sheet-arrive {
		from {
			opacity: 0;
			transform: translateY(0.4em);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.animated > div {
			animation: none;
		}
	}
</style>
