const path = require('path');

const csvreader = require('./lib/csvreader');
const creator = require('./lib/creator');

const BASE_OPTIONS = require('./config/server');
creator.init(BASE_OPTIONS);

process.on('unhandledRejection', function(reason, promise) {
	console.error('undhandled promise rejection: ', reason, promise);
});

function collectLists(val, collection) {
	collection.push(val);
	return collection;
}

const { program } = require('commander');
program
	.version(require('./package.json').version)
	.option('-l, --list [filename.csv]', 'list of user names to be parsed', collectLists, [])
	.option('--rules [rules.js]', 'processing instructions for the files, receives parsed lists, must return promise that resolves to users')
	.option('--print-parsed', 'print parsed data', false)
	.option('--print-directories', 'print all directories that will be created', false)
	.option('--overwrite-passwords', 'reset passwords for existing users', false)
	.option('--create-users', 'create new users if neccessary', false)
	.option('--create-shares', 'create directories and share them', false)
	.option('--move-directories', 'groups directories in subdirs by prefix', false)
	.option('--delete-directories', 'delete directories that were created by the ruleset', false)
	.option('--send-mails', 'send welcome mails to users', false)
	.option('--trigger-password-reset', 'have nextcloud send out a reset password mail', false)
	.option('--only [userid]', 'need to run everything again but just for that one person? use this.', false)
	.parse(process.argv);

const options = program.opts();

const rules = require(path.resolve(options.rules));

const listPromises = options.list.map((list) => {
	return csvreader(list);
});

let chain = Promise.all(listPromises).then((lists) => rules.usersAndShares(lists, BASE_OPTIONS));

if (options.only) {
	chain = chain.then((users) => {
		for (const u of users) {
			if (u.userid === options.only) {
				return [u];
			}
		}
		return [];
	});
}

if (options.printParsed) {
	chain = chain.then((users) => {
		console.log(users);
		return users;
	});
}

if (options.printDirectories) {
	chain = chain.then((users) => {
		const dirs = new Set(users.map((u) => {
			return Object.keys(u.shares || {});
		}).flat());
		console.log(dirs);
		return users;
	});
}

if (options.createUsers) {
	chain = chain.then((users) => {
		creator.options.resetPassword = options.overwritePasswords;
		return creator.createUsers(users).then(() => users);
	});
}

if (options.createShares) {
	chain = chain.then((users) => {
		return creator.createShares(users).then(() => users);
	});
}

if (options.moveDirectories && rules.moveInstructions) {
	const { mover } = require('./lib/mover');
	chain = chain.then((users) => {
		return mover(users, rules.moveInstructions, BASE_OPTIONS).then(() => users);
	});
}

if (options.deleteDirectories) {
	chain = chain.then((users) => {
		return creator.deleteShares(users).then(() => users);
	});
}

if (options.sendMails) {
	const mailer = require('./lib/mailer');
	chain = chain.then((users) => {
		mailer.init(BASE_OPTIONS);
		return mailer.sendToAll(users).then(() => users);
	});
}

if (options.triggerPasswordReset) {
	const passwordResetRequester = require('./lib/passwordResetRequester');
	chain = chain.then((users) => {
		passwordResetRequester.init(BASE_OPTIONS.hostname);
		return passwordResetRequester.requestForAll(users).then(() => users);
	});
}

chain.then();
