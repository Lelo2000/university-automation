const Promise = require('bluebird');
const createDirectoryAs = require('./createDirectoryAs');

var ocApiFactory = require('./nextcloud-api');
var api = null;

process.on('unhandledRejection', function(reason, p){
	console.log('Unhandled', reason, p); // log all your errors, "unsuppressing" them.
	throw reason; // optional, in case you want to treat these as errors
});


function debuginfo(result) {
	var r = result;
	if (!r.forEach) {
		r = [r];
	}
	r.forEach((result) => {
		if (result.response && result.response.substr(0,6) === '250 OK') {
			// all is well
		} else if (result.response) {
			console.log(result.response);
		} else if (result.xml.ocs.meta[0].statuscode[0] == 102) {
			console.log('Status Code 102 %s for %s', result.xml.ocs.meta[0].message[0], JSON.stringify(result.request));
		} else if (result.xml.ocs.meta[0].statuscode[0] == 100) {
			// all is well
		} else if (result.xml.ocs.meta[0].statuscode[0] == 101 && result.request.path.endsWith('/enable')) {
			console.log('User already enabled, nothing to do.');
		} else if (result.xml.ocs.meta[0].statuscode[0] == 403 && result.xml.ocs.meta[0].message[0] == 'Path is already shared with this group') {
			// all is well
		} else if (result.xml.ocs.meta[0].statuscode[0] == 403 && result.xml.ocs.meta[0].message[0] == 'Path is already shared with this user') {
			// all is well
		} else {
			console.dir(result.request);
			console.dir(result.xml.ocs.meta[0]);
		}
	});
	return result;
}

function updateUser(user) {
	var promises = [];
	if (user.email) {
		promises.push(api.changeUserProperty(user.userid, 'email', user.email));
	}
	if (user.password && creator.options.resetPassword) {
		if (user.userid !== creator.options.adminuser) {
			console.log(`attempting to reset password for ${user.userid}`);
			promises.push(api.changeUserProperty(user.userid, 'password', user.password));
		} else {
			console.log(`not changing password for privileged user ${user.userid}`);
		}
	}
	if (user.name) {
		promises.push(api.changeUserProperty(user.userid, 'display', user.name));
	}
	if (user.quota) {
		promises.push(api.changeUserProperty(user.userid, 'quota', user.quota));
	}

	return Promise.all(promises);
}

function createSingleUser(currentUser, index = 0, total = 0) {
	console.log(`User ${index+1}/${total}: ${currentUser.userid}`);

	currentUser.groups = currentUser.groups || [];

	// console.log(" - create");
	return api.createUser(currentUser).then(debuginfo).then(() => {
		// console.log(" - settings");
		return updateUser(currentUser).then(debuginfo);
	}).then(() => {
		return api.enableUser(currentUser).then(debuginfo);
	}).then(() => {
		// console.log(" - groups: " + currentUser.groups.join(', '));
		return api.setGroups(currentUser.userid, currentUser.groups).then(debuginfo);
	});
}


function createSingleUserShares(currentUser, index = 0, total = 0) {
	console.log(`Shares ${index+1}/${total}: ${currentUser.userid}`);

	currentUser.shares = currentUser.shares || {};

	let chain = Promise.resolve();
	Object.keys(currentUser.shares).forEach((dirname) => {
		// console.log(' - create dir %s', dirname);
		chain = chain.then(() => {
			return createDirectoryAs(dirname, {path: creator.options.webdav_path, user: currentUser.userid, password: currentUser.password}).catch((err) => {
				if (err.status != 405) { // 405 is
					console.error('createDirectoryAs failed: ', JSON.stringify(err), dirname);
				} else {
					console.log('Directory exists: ', dirname);
				}
			}).then(() => {
				// console.log('   - share %s with %s', dirname, currentUser.shares[dirname].shareWith);
				return api.share(dirname, currentUser.shares[dirname], { auth: currentUser.userid + ':' + currentUser.password }).then(debuginfo);
			});
		});
	});
	return chain;
}


const creator = {
	options: {},
	init: function (options) {
		creator.options = options;
		api = ocApiFactory(options);
	},
	createUserGroups: (users) => {
		var groups = [];
		users.forEach((user) => {
			if (user.groups) {
				user.groups.forEach((group) => {
					if (groups.indexOf(group) < 0) { groups.push(group); }
				});
			}
		});
		// console.log("- Attempting to create these groups:", groups);
		return api.addGroups(groups);
	},
	createUsers: (users) => {
		return creator
			.createUserGroups(users)
			.then(debuginfo)
			.then(() => { return Promise.mapSeries(users, createSingleUser, {concurrency: 1}); })
			.then(function () {
				console.log('Created Users');
			});
	},
	createShares: (users) => {
		return Promise.mapSeries(users, createSingleUserShares, {concurrency: 1})
			.then(function () {
				console.log('Created Shares');
			});
	}
};

module.exports = creator;
