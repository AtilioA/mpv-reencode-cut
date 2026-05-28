const fs = require('fs');
const path = require('path');

// Get target directory from command line argument or use default
const defaultTarget = path.join(__dirname, '..', 'release');
const args = process.argv.slice(2);
const cleanTarget = args.includes('--clean');
const targetArg = args.find(arg => arg !== '--clean');
const targetDir = targetArg ? path.resolve(targetArg) : defaultTarget;

const scriptDir = path.join(__dirname, 'mpv-reencode-cut');
const distDir = path.join(scriptDir, 'dist');

// Ensure directory exists and is writable
function ensureDirectory(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
            console.log(`Created directory: ${dir}`);
        }
        const testFile = path.join(dir, '.permission-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return true;
    } catch (error) {
        console.error(`Error accessing directory ${dir}: ${error.message}`);
        return false;
    }
}

// Clean up target directory if it's the default one
if (targetDir === defaultTarget && fs.existsSync(targetDir)) {
    console.log('Cleaning up target directory...');
    try {
        fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (error) {
        console.error(`Failed to clean target directory: ${error.message}`);
        process.exit(1);
    }
}

if (cleanTarget && targetDir !== defaultTarget) {
    cleanManagedInstall(targetDir);
}

// Create directory structure
const dirs = [
    path.join(targetDir, 'scripts', 'mpv-reencode-cut'),
    path.join(targetDir, 'scripts', 'mpv-reencode-cut', 'dist'),
    path.join(targetDir, 'script-opts')
];

for (const dir of dirs) {
    if (!ensureDirectory(dir)) process.exit(1);
}

// Utility to get files matching a simple pattern like "*.lua" or "*.js"
function getMatchingFiles(dir, extension) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith(extension) && !f.endsWith('.test.js'))
        .map(f => path.join(dir, f));
}

// Copy individual files safely
function copyFiles(files, targetDir) {
    if (!ensureDirectory(targetDir)) return false;

    let success = true;
    for (const file of files) {
        try {
            if (fs.existsSync(file)) {
                const targetFile = path.join(targetDir, path.basename(file));
                fs.copyFileSync(file, targetFile, fs.constants.COPYFILE_FICLONE);
                fs.chmodSync(targetFile, 0o644);
                console.log(`Copied: ${file} -> ${targetFile}`);
            }
        } catch (error) {
            console.error(`Error copying file ${file}: ${error.message}`);
            success = false;
        }
    }
    return success;
}

function cleanManagedInstall(targetDir) {
    const managedScriptDir = path.join(targetDir, 'scripts', 'mpv-reencode-cut');
    const managedConfigFile = path.join(targetDir, 'script-opts', 'mpv-reencode-cut.conf');

    for (const managedPath of [managedScriptDir, managedConfigFile]) {
        if (fs.existsSync(managedPath)) {
            fs.rmSync(managedPath, { recursive: true, force: true });
            console.log(`Removed stale managed path: ${managedPath}`);
        }
    }
}

let allSuccess = true;

// Copy Lua files
allSuccess = copyFiles(
    getMatchingFiles(scriptDir, '.lua'),
    path.join(targetDir, 'scripts', 'mpv-reencode-cut')
) && allSuccess;

// Copy JS files from dist/
allSuccess = copyFiles(
    getMatchingFiles(distDir, '.js'),
    path.join(targetDir, 'scripts', 'mpv-reencode-cut', 'dist')
) && allSuccess;

// Copy config file if it exists
const configPath = path.join(__dirname, '..', 'script-opts', 'mpv-reencode-cut.conf');
if (fs.existsSync(configPath)) {
    allSuccess = copyFiles(
        [configPath],
        path.join(targetDir, 'script-opts')
    ) && allSuccess;
} else {
    console.log('Config file not found.');
}

if (allSuccess) {
    console.log(`\n✅ Release package created successfully!`);
    console.log(`Location: ${targetDir}`);
    process.exit(0);
} else {
    console.error('\n❌ Some files could not be copied. Check the errors above.');
    process.exit(1);
}
