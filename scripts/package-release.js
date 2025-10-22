const fs = require('fs');
const path = require('path');

// Get target directory from command line argument or use default
const defaultTarget = path.join(__dirname, '..', 'release');
const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultTarget;

const scriptDir = path.join(__dirname, 'mpv-reencode-cut');
const distDir = path.join(scriptDir, 'dist');

// Ensure target directory exists and is writable
function ensureDirectory(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
            console.log(`Created directory: ${dir}`);
        }
        // Test write permission
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

// Create directory structure
const dirs = [
    path.join(targetDir, 'scripts', 'mpv-reencode-cut', 'dist', 'utils'),
    path.join(targetDir, 'script-opts')
];

// Create all required directories
for (const dir of dirs) {
    if (!ensureDirectory(dir)) {
        process.exit(1);
    }
}

// Copy files with error handling
function copyFiles(patterns, targetDir) {
    if (!ensureDirectory(targetDir)) {
        return false;
    }

    let success = true;
    patterns.forEach(pattern => {
        try {
            const files = pattern.includes('*')
                ? fs.readdirSync(path.dirname(pattern))
                    .filter(f => f.match(new RegExp('^' + path.basename(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')))
                    .map(f => path.join(path.dirname(pattern), f))
                : [pattern];

            files.forEach(file => {
                try {
                    if (fs.existsSync(file)) {
                        const targetFile = path.join(targetDir, path.basename(file));
                        // Overwrite existing files
                        fs.copyFileSync(file, targetFile, fs.constants.COPYFILE_FICLONE);
                        // Set read permissions (444: r--r--r--)
                        fs.chmodSync(targetFile, 0x1a4);
                        console.log(`Copied: ${file} -> ${targetFile}`);
                    }
                } catch (error) {
                    console.error(`Error copying file ${file}: ${error.message}`);
                    success = false;
                }
            });
        } catch (error) {
            console.error(`Error processing pattern ${pattern}: ${error.message}`);
            success = false;
        }
    });
    return success;
}

// Perform all file copies
let allSuccess = true;

// Copy Lua files
allSuccess = copyFiles(
    [path.join(scriptDir, '*.lua')],
    path.join(targetDir, 'scripts', 'mpv-reencode-cut')
) && allSuccess;

// Copy main JS files
allSuccess = copyFiles(
    [path.join(distDir, '*.js')],
    path.join(targetDir, 'scripts', 'mpv-reencode-cut', 'dist')
) && allSuccess;

// Copy utils JS files
allSuccess = copyFiles(
    [path.join(distDir, 'utils', '*.js')],
    path.join(targetDir, 'scripts', 'mpv-reencode-cut', 'dist', 'utils')
) && allSuccess;

// Copy config file if exists (check both possible locations)
const configPath = path.join(__dirname, '..', 'script-opts', 'mpv-reencode-cut.conf');

let configCopied = false;
if (fs.existsSync(configPath)) {
    allSuccess = copyFiles(
        [configPath],
        path.join(targetDir, 'script-opts')
    ) && allSuccess;
    configCopied = true;
}

if (!configCopied) {
    console.log('Config file not found in any of these locations:', possibleConfigPaths);
}

if (allSuccess) {
    console.log(`\n✅ Release package created successfully!`);
    console.log(`Location: ${targetDir}`);
    process.exit(0);
} else {
    console.error('\n❌ Some files could not be copied. Check the errors above.');
    process.exit(1);
}
