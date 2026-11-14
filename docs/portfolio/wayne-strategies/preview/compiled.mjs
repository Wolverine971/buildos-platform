// docs/portfolio/wayne-strategies/preview/compiled.mjs
import * as $ from 'file:///Users/djwayne/buildos-platform/node_modules/.pnpm/svelte@5.57.1/node_modules/svelte/src/internal/server/index.js';

function folio($$renderer, number, text) {
	$$renderer.push(
		`<div class="folio svelte-1w9hrwr"><span class="svelte-1w9hrwr">${$.escape(number)} / BUILDOS</span><span class="svelte-1w9hrwr">${$.escape(text)}</span></div>`
	);
}

export default function ProjectVisual($$renderer, $$props) {
	let { layerId, compact = false, animated = false } = $$props;
	const root = '/assets/work/projects/buildos/';

	const labels = {
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

	const description = $.derived(() => labels[layerId] ?? labels.workspace);

	const textures = [
		{ name: 'Bloom', meaning: 'Ideas', className: 'bloom' },
		{ name: 'Grain', meaning: 'Execution', className: 'grain' },
		{
			name: 'Thread',
			meaning: 'Relationships',
			className: 'thread'
		},
		{ name: 'Grid', meaning: 'Input', className: 'grid' }
	];

	function wordmark($$renderer, dark = false) {
		$$renderer.push(
			`<img class="wordmark svelte-1w9hrwr"${$.attr('src', `${root}wordmark-${dark ? 'ink' : 'paper'}.webp`)} alt="BuildOS" width="1200" height="360"/>`
		);
	}

	$$renderer.push(
		`<div class="stage svelte-1w9hrwr" role="img"${$.attr('aria-label', description())}><div${$.attr_class($.clsx(['canvas', { compact, animated }]), 'svelte-1w9hrwr')} aria-hidden="true">`
	);

	if (layerId === 'conversation') {
		$$renderer.push(`<!--[0--><div class="chat-view svelte-1w9hrwr">`);
		folio($$renderer, '02', 'CONVERSATION → SAVED WORK');
		$$renderer.push(
			`<!----> <div class="chat-title svelte-1w9hrwr"><span class="square-mark svelte-1w9hrwr">↗</span> <div class="svelte-1w9hrwr"><small class="svelte-1w9hrwr">PROJECT CHAT</small> <h2 class="svelte-1w9hrwr">Fading Crown</h2></div> <span class="context-pill svelte-1w9hrwr">Project context</span></div> <div class="bubble svelte-1w9hrwr"><span class="small-label svelte-1w9hrwr">YOU · DEMO REQUEST</span> <p class="svelte-1w9hrwr">Move my Ch. 13 writing block<br class="svelte-1w9hrwr"/>to Thursday afternoon.</p></div> <div class="tool-strip svelte-1w9hrwr"><span class="check svelte-1w9hrwr">✓</span> <div class="svelte-1w9hrwr"><small class="svelte-1w9hrwr">BUILDOS THOUGHTS</small><strong class="svelte-1w9hrwr">Updated task</strong></div> <span class="receipt-tag svelte-1w9hrwr">RECEIPT</span></div> <div class="chat-result svelte-1w9hrwr"><span class="task-symbol svelte-1w9hrwr">✓</span> <div class="svelte-1w9hrwr"><small class="svelte-1w9hrwr">WRITING BLOCK</small> <h3 class="svelte-1w9hrwr">Draft Ch. 13</h3> <p class="svelte-1w9hrwr">Open the task. Inspect the change.</p></div> <span class="link-arrow svelte-1w9hrwr">↗</span></div> <div class="source-capture svelte-1w9hrwr"><span class="small-label svelte-1w9hrwr">ACTUAL PUBLIC DEMO RECEIPT</span><img${$.attr('src', `${root}schedule-chat-demo.jpg`)} alt="" width="1040" height="178" class="svelte-1w9hrwr"/></div> <div class="chat-foot svelte-1w9hrwr"><span class="signal-dot svelte-1w9hrwr"></span><span class="svelte-1w9hrwr">Tool activity stays beside the answer.</span><span class="micro-note svelte-1w9hrwr">FADING CROWN / DEMO</span></div></div>`
		);
	} else if (layerId === 'connected-work') {
		$$renderer.push(`<!--[1--><div class="workbench svelte-1w9hrwr">`);
		folio($$renderer, '03', 'THE PROJECT KEEPS THE CONTEXT');
		$$renderer.push(
			`<!----> <div class="workbench-title svelte-1w9hrwr"><div class="svelte-1w9hrwr"><small class="svelte-1w9hrwr">PROJECT / FICTIONAL DEMO</small> <h2 class="svelte-1w9hrwr">Fading Crown</h2></div> <span class="project-count svelte-1w9hrwr">TASKS + DOCS</span></div> <div class="context-path svelte-1w9hrwr"><span class="svelte-1w9hrwr"><b class="svelte-1w9hrwr">◎</b> Goal</span><i class="svelte-1w9hrwr">›</i><span class="svelte-1w9hrwr"><b class="svelte-1w9hrwr">≡</b> Plan</span><i class="svelte-1w9hrwr">›</i><span class="active-path svelte-1w9hrwr"><b class="svelte-1w9hrwr">✓</b> Task</span><i class="svelte-1w9hrwr">↔</i><span class="svelte-1w9hrwr"><b class="svelte-1w9hrwr">▤</b> Document</span></div> <div class="workbench-body svelte-1w9hrwr"><div class="document-tree svelte-1w9hrwr"><small class="svelte-1w9hrwr">PROJECT FILES</small><span class="tree-current svelte-1w9hrwr">▾   Manuscript</span><span class="svelte-1w9hrwr">└   Act I</span><span class="svelte-1w9hrwr">└   Character notes</span><span class="svelte-1w9hrwr">└   World &amp; magic</span><span class="tree-divider svelte-1w9hrwr"></span><small class="svelte-1w9hrwr">WORK</small><span class="svelte-1w9hrwr">◎   First draft</span><span class="svelte-1w9hrwr">≡   Revision plan</span><span class="tree-current svelte-1w9hrwr">✓   Task board</span></div> <div class="board-capture svelte-1w9hrwr"><div class="board-heading svelte-1w9hrwr"><strong class="svelte-1w9hrwr">Task board</strong><span class="svelte-1w9hrwr">THE ACTUAL DEMO</span></div> <img${$.attr('src', `${root}task-board-demo.jpg`)} alt="" width="980" height="310" class="svelte-1w9hrwr"/></div> <div class="document-sheet svelte-1w9hrwr"><span class="document-tab svelte-1w9hrwr">DOCUMENT / STUDY</span><small class="svelte-1w9hrwr">PROJECT CONTEXT</small> <h3 class="svelte-1w9hrwr">The rules<br class="svelte-1w9hrwr"/>of magic.</h3> <p class="svelte-1w9hrwr">Magic costs memories.<br class="svelte-1w9hrwr"/>The wards are failing.</p> <div class="writing-lines svelte-1w9hrwr"></div> <div class="doc-bottom svelte-1w9hrwr"><span class="svelte-1w9hrwr">▤ Context</span><span class="svelte-1w9hrwr">◷ History</span></div></div></div> <div class="workbench-foot svelte-1w9hrwr"><span class="svelte-1w9hrwr">One project. Connected artifacts.</span><span class="svelte-1w9hrwr">SCREENSHOT + INTERFACE STUDY</span></div></div>`
		);
	} else if (layerId === 'sharing') {
		$$renderer.push(`<!--[2--><div class="sharing-view thread svelte-1w9hrwr">`);
		folio($$renderer, '04', 'COLLABORATION WITH BOUNDARIES');
		$$renderer.push(
			`<!----> <div class="share-side svelte-1w9hrwr"><small class="svelte-1w9hrwr">PEOPLE + AGENTS</small> <h2 class="svelte-1w9hrwr">Shared work.<br class="svelte-1w9hrwr"/><em class="svelte-1w9hrwr">Clear rights.</em></h2> <p class="svelte-1w9hrwr">Choose what a person can do.<br class="svelte-1w9hrwr"/>Then choose what their agents can do.</p> <div class="permission-key svelte-1w9hrwr"><span class="svelte-1w9hrwr">01</span> Person’s role<br class="svelte-1w9hrwr"/><span class="svelte-1w9hrwr">02</span> Their agents’ access</div></div> <div class="share-sheet svelte-1w9hrwr"><div class="sheet-heading svelte-1w9hrwr"><span class="share-icon svelte-1w9hrwr">↗</span> <div class="svelte-1w9hrwr"><small class="svelte-1w9hrwr">SHARE PROJECT</small> <h3 class="svelte-1w9hrwr">Fading Crown</h3></div></div> <div class="share-tabs svelte-1w9hrwr"><strong class="svelte-1w9hrwr">People</strong><span class="svelte-1w9hrwr">Invite link</span></div> <div class="member-head svelte-1w9hrwr"><span class="svelte-1w9hrwr">DEMO ROLE</span><span class="svelte-1w9hrwr">PERSON</span><span class="svelte-1w9hrwr">AGENTS</span></div> <div class="member svelte-1w9hrwr"><span class="svelte-1w9hrwr"><i class="svelte-1w9hrwr">O</i> Project owner</span><b class="svelte-1w9hrwr">Owner</b><b class="access-write svelte-1w9hrwr">Write</b></div> <div class="member svelte-1w9hrwr"><span class="svelte-1w9hrwr"><i class="svelte-1w9hrwr">E</i> Editorial lead</span><b class="svelte-1w9hrwr">Editor</b><b class="svelte-1w9hrwr">Read</b></div> <div class="member svelte-1w9hrwr"><span class="svelte-1w9hrwr"><i class="svelte-1w9hrwr">R</i> Beta reader</span><b class="svelte-1w9hrwr">Viewer</b><b class="svelte-1w9hrwr">Off</b></div> <div class="invite-strip grid svelte-1w9hrwr"><span class="small-label svelte-1w9hrwr">INVITE LINK</span><strong class="svelte-1w9hrwr">Viewer · Agents Read</strong><span class="svelte-1w9hrwr">Expires after 7 days <b class="svelte-1w9hrwr">↗</b></span></div> <div class="permission-rule svelte-1w9hrwr"><span class="svelte-1w9hrwr">↳</span> Agent Write requires an editing role.</div></div> <div class="sharing-foot svelte-1w9hrwr"><span class="svelte-1w9hrwr">Invite · Set access · Revoke</span><span class="svelte-1w9hrwr">INTERFACE STUDY / DEMO ROLES</span></div></div>`
		);
	} else if (layerId === 'execution') {
		$$renderer.push(`<!--[3--><div class="execution-view svelte-1w9hrwr">`);
		folio($$renderer, '05', 'WORK OUTLIVES THE BROWSER');
		$$renderer.push(
			`<!----> <div class="execution-heading svelte-1w9hrwr"><div class="svelte-1w9hrwr"><small class="svelte-1w9hrwr">WORKER-OWNED EXECUTION</small> <h2 class="svelte-1w9hrwr">Still working.</h2></div> <span class="runtime-stamp svelte-1w9hrwr">DURABLE<br class="svelte-1w9hrwr"/>BY DESIGN</span></div> <div class="execution-body svelte-1w9hrwr"><div class="work-inbox svelte-1w9hrwr"><h3 class="svelte-1w9hrwr">Agent work</h3> <div class="work-tabs svelte-1w9hrwr"><strong class="svelte-1w9hrwr">Recent work</strong><span class="svelte-1w9hrwr">Automations</span></div> <small class="svelte-1w9hrwr">ILLUSTRATIVE RUN</small> <div class="run-ticket svelte-1w9hrwr"><span class="signal-dot svelte-1w9hrwr"></span><strong class="svelte-1w9hrwr">Fading Crown</strong> <p class="svelte-1w9hrwr">Update writing schedule</p> <span class="run-state svelte-1w9hrwr">Result saved</span></div> <div class="run-legend svelte-1w9hrwr"><span class="svelte-1w9hrwr">Active</span><span class="svelte-1w9hrwr">History</span></div></div> <div class="execution-record svelte-1w9hrwr"><span class="small-label svelte-1w9hrwr">TURN RECORD / EXPLAINED</span> <div class="record-row svelte-1w9hrwr"><span class="svelte-1w9hrwr">01</span> <div class="svelte-1w9hrwr"><strong class="svelte-1w9hrwr">Queued → claimed</strong><small class="svelte-1w9hrwr">One execution owns the turn</small></div> <i class="svelte-1w9hrwr">✓</i></div> <div class="record-row svelte-1w9hrwr"><span class="svelte-1w9hrwr">02</span> <div class="svelte-1w9hrwr"><strong class="svelte-1w9hrwr">Tool receipt saved</strong><small class="svelte-1w9hrwr">Result joins the durable record</small></div> <i class="svelte-1w9hrwr">✓</i></div> <div class="record-row svelte-1w9hrwr"><span class="svelte-1w9hrwr">03</span> <div class="svelte-1w9hrwr"><strong class="svelte-1w9hrwr">Browser reconnects</strong><small class="svelte-1w9hrwr">Reconcile saved text + events</small></div> <i class="svelte-1w9hrwr">↻</i></div></div></div> <div class="calendar-strip svelte-1w9hrwr"><div class="svelte-1w9hrwr"><small class="svelte-1w9hrwr">CONNECTED WORK</small><strong class="svelte-1w9hrwr">Project events ↔ Calendar</strong><span class="svelte-1w9hrwr">Separate background sync jobs</span></div> <img${$.attr('src', `${root}calendar-demo.jpg`)} alt="" width="974" height="344" class="svelte-1w9hrwr"/></div> <div class="execution-foot svelte-1w9hrwr">WORKER LIFECYCLE / ILLUSTRATED</div></div>`
		);
	} else if (layerId === 'inkprint') {
		$$renderer.push(`<!--[4--><div class="inkprint-view svelte-1w9hrwr">`);
		folio($$renderer, '06', 'INKPRINT / DESIGN SYSTEM');
		$$renderer.push(
			`<!----> <div class="inkprint-heading svelte-1w9hrwr"><h2 class="svelte-1w9hrwr">Feels like a<br class="svelte-1w9hrwr"/><em class="svelte-1w9hrwr">place to work.</em></h2> <span class="edition svelte-1w9hrwr">PAPER + INK<br class="svelte-1w9hrwr"/>SEMANTIC TEXTURES<br class="svelte-1w9hrwr"/>SURFACE WEIGHTS</span></div> <div class="theme-pair svelte-1w9hrwr"><div class="theme-paper grid svelte-1w9hrwr">`
		);
		wordmark($$renderer);
		$$renderer.push(
			`<!----><span class="theme-label svelte-1w9hrwr">01 / PAPER STUDIO</span> <div class="theme-task svelte-1w9hrwr"><span class="svelte-1w9hrwr">✓</span><strong class="svelte-1w9hrwr">Make the next move.</strong><span class="mini-state svelte-1w9hrwr">In progress</span></div></div> <div class="theme-ink grid svelte-1w9hrwr">`
		);
		wordmark($$renderer, true);
		$$renderer.push(
			`<!----><span class="theme-label svelte-1w9hrwr">02 / INK ROOM</span> <div class="theme-task svelte-1w9hrwr"><span class="svelte-1w9hrwr">✓</span><strong class="svelte-1w9hrwr">Keep the context.</strong><span class="mini-state svelte-1w9hrwr">In progress</span></div></div></div> <div class="texture-row svelte-1w9hrwr"><!--[-->`
		);

		const each_array = $.ensure_array_like(textures);

		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let texture = each_array[$$index];

			$$renderer.push(
				`<div class="texture-specimen svelte-1w9hrwr"><div${$.attr_class($.clsx(['texture-swatch', texture.className]), 'svelte-1w9hrwr')}></div> <strong class="svelte-1w9hrwr">${$.escape(texture.name)}</strong><span class="svelte-1w9hrwr">${$.escape(texture.meaning)}</span></div>`
			);
		}

		$$renderer.push(
			`<!--]--></div> <div class="inkprint-foot svelte-1w9hrwr"><span class="svelte-1w9hrwr">One canonical token system.</span><span class="native-note svelte-1w9hrwr">NATIVE APP / IN DEVELOPMENT</span></div></div>`
		);
	} else {
		$$renderer.push(`<!--[-1--><div class="workspace-view svelte-1w9hrwr">`);
		folio($$renderer, '01', 'A PROJECT WORKSPACE YOU CAN TALK TO');
		$$renderer.push(`<!----> <div class="workspace-copy svelte-1w9hrwr">`);
		wordmark($$renderer);
		$$renderer.push(
			`<!----> <h2 class="svelte-1w9hrwr">Messy thinking.<br class="svelte-1w9hrwr"/><em class="svelte-1w9hrwr">Structured work.</em></h2> <p class="svelte-1w9hrwr">The project remembers what matters.</p></div> <div class="workspace-capture svelte-1w9hrwr"><div class="window-strip svelte-1w9hrwr"><span class="window-dots svelte-1w9hrwr">● ● ●</span><span class="svelte-1w9hrwr">FADING CROWN / PUBLIC DEMO</span><span class="svelte-1w9hrwr">↗</span></div> <img${$.attr('src', `${root}project-demo.jpg`)} alt="" width="1010" height="500" class="svelte-1w9hrwr"/></div> <div class="workspace-note svelte-1w9hrwr"><span class="note-arrow svelte-1w9hrwr">↳</span> <div class="svelte-1w9hrwr"><strong class="svelte-1w9hrwr">Real work, in one place.</strong><span class="svelte-1w9hrwr">Tasks · Documents · Project context</span></div></div> <div class="workspace-stamp svelte-1w9hrwr">ROUGH IDEA<br class="svelte-1w9hrwr"/><span class="svelte-1w9hrwr">↓</span><br class="svelte-1w9hrwr"/>WORKING PROJECT</div> <div class="workspace-foot svelte-1w9hrwr"><span class="svelte-1w9hrwr">BUILDOS</span><span class="svelte-1w9hrwr">ACTUAL DEMO / AUGUST 2026</span></div></div>`
		);
	}

	$$renderer.push(`<!--]--></div></div>`);
}
