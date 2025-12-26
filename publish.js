const fs = require('fs');
const { exec } = require('child_process');

const versionFile = 'version.js';

fs.readFile(versionFile, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading version file:', err);
        return;
    }

    const versionMatch = data.match(/APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/);
    if (!versionMatch) {
        console.error('Could not parse version from version.js');
        return;
    }

    let [_, major, minor, patch] = versionMatch;
    patch = parseInt(patch) + 1;
    const newVersion = `${major}.${minor}.${patch}`;

    const newContent = data.replace(/APP_VERSION = '.*'/, `APP_VERSION = '${newVersion}'`);

    fs.writeFile(versionFile, newContent, 'utf8', (err) => {
        if (err) {
            console.error('Error writing version file:', err);
            return;
        }

        console.log(`Version bumped to ${newVersion}`);

        const commitMsg = `Publish v${newVersion}`;
        const command = `git add . && git commit -m "${commitMsg}" && git push`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing git commands: ${error}`);
                return;
            }
            console.log(`Git output: ${stdout}`);
            if (stderr) console.error(`Git stderr: ${stderr}`);
            console.log('Successfully published!');
        });
    });
});
