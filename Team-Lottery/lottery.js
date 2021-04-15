import {hex} from './helpers.js';
import Group from './model/Group.js';
import Item from './model/Item.js';
import {grabify, dropify} from './dragAndDrop.js';
import {ANIMATION_DURATION, closeGap, moveCandidateToGroup, rejectionWiggle, eternalRejectionDisplay} from './animations.js';

const $ = document.querySelector.bind(document);
let autorun = false;
const candidates = [];
let candidatePointer = 0;
const groups = [];
let groupPointer = 0;
let rejectionCounter = 0;
let genderSplit = {};

$('#groupNumber').addEventListener('change', groupChange);
$('#groupNumber').addEventListener('pointerup', groupChange);
$('#groupNumber').addEventListener('keyup', groupChange);
$('#groupBasename').addEventListener('change', groupChange);
$('#groupBasename').addEventListener('keyup', groupChange);
$('#groupBasename').addEventListener('pointerup', groupChange);
$('#names').addEventListener('change', candidateChange);
$('#names').addEventListener('keyup', candidateChange);
$('#randomness').addEventListener('change', candidateChange);
$('#run').addEventListener('click', () => {
	autorun = true;
	draw();
});
$('#step').addEventListener('click', () => {
	autorun = false;
	draw();
});
$('#pause').addEventListener('click', () => {
	autorun = false;
});
document.addEventListener('keypress', (e) => {
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
	switch (e.key) {
	case '+':
		$('#groupNumber').value = parseInt($('#groupNumber').value, 10) + 1;
		groupChange();
		break;
	case '-':
		$('#groupNumber').value = parseInt($('#groupNumber').value, 10) - 1;
		groupChange();
		break;
	case 's':
		autorun = false;
		draw();
		break;
	}
});
$('#showHashes').addEventListener('change', (e) => {
	document.body.classList.toggle('hashes', e.currentTarget.checked);
});
$('#showNames').addEventListener('change', (e) => {
	document.body.classList.toggle('names', e.currentTarget.checked);
});
document.body.classList.toggle('names', $('#showNames').checked);
document.body.classList.toggle('hashes', $('#showHashes').checked);
$('#namebox .tab').addEventListener('click', () => {
	$('#namebox').classList.toggle('expanded');
});
groupChange();
candidateChange();

document.addEventListener('paste', (e) => {
	e.preventDefault();
	const clipboardData = e.clipboardData || window.clipboardData;
	const data = clipboardData.getData('text/plain');
	$('#names').value = data;
	candidateChange();
});

document.addEventListener('copy', (e) => {
	e.preventDefault();

	e.clipboardData.setData('text/plain', groups.map((g) => {
		const members = g.members.map(m => `- ${m.label}`).sort().join('\n');
		return '# ' + g.domElement.querySelector('h2').innerText + '\n' + members;
	}).join('\n\n'));

	e.clipboardData.setData('text/html', groups.map((g) => {
		const heading = g.domElement.querySelector('h2').innerHTML;
		const items = g.members.map(m => m.label).sort().join('</li><li>');
		return `<h2>${heading}</h2><ul><li>${items}</li></ul>`;
	}).join('\n'));
});

document.addEventListener('cut', (e) => {
	e.preventDefault();

	e.clipboardData.setData('text/plain', '"Name"\t"Gruppe"\r\n' + groups.map((g) => {
		const group = `"${g.domElement.querySelector('h2').innerText}"`;
		return g.members.map(m => `"${m.label}"\t${group}`).sort().join('\r\n');
	}).sort().join('\r\n'));
});

function groupChange() {
	const groupNumber = parseInt($('#groupNumber').value, 10);
	const groupBasename = $('#groupBasename').value;
	const playground = $('#playground');
	while (playground.children.length > 0) {
		playground.removeChild(playground.children[0]);
	}
	groups.splice(0,groups.length); // empty the array as well.

	for (let i = 0; i < groupNumber; i++) {
		const g = new Group(i, groupBasename);

		dropify(g.domElement, (event, draggable) => {
			const item = draggable.original.lotteryItem;
			const group = event.currentTarget.lotteryGroup;

			const follower = item.domElement.nextSibling;
			const shadow = item.domElement.getBoundingClientRect();
			const before = draggable.element.getBoundingClientRect();
			if (item.group === null) {
				let index = candidates.indexOf(item);
				if (index > -1) {
					candidates.splice(index, 1);
				}
			}
			group.add(item);
			const after = item.domElement.getBoundingClientRect();
			moveCandidateToGroup(item, before, after);
			if (follower && $('#animations').checked) {
				closeGap(follower, shadow.height);
			}
			updatePointerHighlight();
		});

		playground.appendChild(g.domElement);
		groups.push(g);
	}

	groupPointer = 0;
}

function candidateChange() {
	const names = $('#names').value
		.split('\n')
		.map((c) => c.trim())
		.filter((c) => c);

	const randomness = $('#randomness').value;
	const encoder = new TextEncoder('utf-8');
	candidates.splice(0, candidates.length);
	candidatePointer = 0;

	Promise.all(names.map((name) => {
		var buffer = encoder.encode(name + randomness);
		return crypto.subtle.digest('SHA-256', buffer).then((hash) => [name, hash]);
	})).then((hashes) => {
		hashes.forEach((h) => {
			h[1] = hex(h[1]).substr(0,4);
		});
		hashes = hashes.sort((a, b) => {
			return a[1].localeCompare(b[1]);
		});
		const candidateList = $('#candidates');
		while (candidateList.children.length > 0) {
			candidateList.removeChild(candidateList.children[0]);
		}
		for (let i = 0; i < hashes.length; i++) {
			const item = new Item(i, hashes[i][0], hashes[i][1]);
			candidateList.appendChild(item.domElement);
			candidates.push(item);
			item.domElement.addEventListener('pointerdown', () => {
				groups.forEach((group) => {
					var reasons = rejectMemberReason(item, group);
					if (reasons.length > 0) {
						eternalRejectionDisplay(item, reasons, 'red');
					}
				});
				document.addEventListener('pointerup', () => {
					groups.forEach((group) => {
						var reasons = rejectMemberReason(item, group);
						eternalRejectionDisplay(item, reasons, null);
					});
				});
			});
			grabify(item.domElement);
		}

		genderSplit = {};
		candidates.forEach((c) => {
			genderSplit[c.gender] = (genderSplit[c.gender] + 1) || 1;
		});
		for (const [key, value] of Object.entries(genderSplit)) {
			console.log(`${key}: ${value}/${candidates.length} (${Math.round(100 * value / candidates.length)}%)`);
		}
	});
	groupChange();
}

function updatePointerHighlight() {
	document.querySelectorAll('.candidate').forEach((c) => {
		c.classList.remove('active');
	});
	if (candidates.length === 0) {
		return;
	}

	if (candidatePointer >= candidates.length) {
		candidatePointer = candidatePointer % candidates.length;
	}
	candidates[candidatePointer].domElement.classList.add('active');
}

function draw() {
	if (candidates.length == 0) {
		updatePointerHighlight();
		return;
	}

	const g = groups[groupPointer];
	if (candidatePointer >= candidates.length) {
		candidatePointer = candidatePointer % candidates.length;
	}
	updatePointerHighlight();
	const active = candidates[candidatePointer];

	var reasons = rejectMemberReason(active, g);
	if (reasons.length > 0) {
		rejectionCounter++;
		if ($('#animations').checked) {
			rejectionWiggle(active, reasons);
		}
		candidatePointer += 1;
		if (rejectionCounter > candidates.length) {
			// too many retries.
			rejectionCounter = 0;
			autorun = false;

			// we're not currently skipping groups. Without further work this would
			// lead to uneven group sizes.
			// groupPointer = ++groupPointer % groups.length;
		}
	} else {
		console.log(`💚 ${active.label} assigned to ${g.title}`);
		rejectionCounter = 0;
		const follower = active.domElement.nextSibling;
		const before = active.domElement.getBoundingClientRect();
		g.add(active);
		const after = active.domElement.getBoundingClientRect();
		moveCandidateToGroup(active, before, after);
		if (follower && $('#animations').checked) {
			closeGap(follower, before.height);
		}

		candidates.splice(candidatePointer, 1);

		groups[groupPointer].domElement.classList.remove('active');
		groupPointer = ++groupPointer % groups.length;
		groups[groupPointer].domElement.classList.add('active');
		// not modifying candidatePointer because we just removed one person from the list anyway.
	}

	if (autorun) {
		setTimeout(draw, $('#animations').checked ? ANIMATION_DURATION + 50 : 0);
	}
}

candidate.label} not assignable to ${group.title} because ${sameGenderInTeam} share the same gender. (Maximum is ${maxAllowedSameGenderMembers})`);
			// more than two thirds already have the same gender, this is not a good idea.
			reasons.push(group.domElement.querySelector('h2'));
			// pushing all the members with same gender to the reasons array.
			reasons.push(...group.members.filter((m) => m.gender === candidate.gender).map((m) => m.domElement.querySelector('.name')));
		}
		console.log('all done, carry on');
	}

	return reasons;
}
