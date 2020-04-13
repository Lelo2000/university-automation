var { moveDirectoriesAs } = require('./moveDirectoriesAs');

const mover = async function (users, moveInstructions, config) {
	for (let i = 0; i < users.length; i++) {
		const user = users[i];
		console.log("(%d/%d) moving %s ...", (i+1), users.length, user.userid);

		for (const instruction of moveInstructions) {
			let successfulMoves = 0;
			try {
				const results = await moveDirectoriesAs('/', instruction.pattern, instruction.target, [config.webdav_path, users.userid, users.password]);
				successfulMoves += results.length;
			} catch (err) {
				console.error("ERROR moving dirs for %s: %s", user.userid, err);
			}
			console.log("  ... moved %d dirs for %s", successfulMoves, user.userid);
		}
	}
};

module.exports = {
	mover
};
