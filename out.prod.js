const ncp = require('ncp').ncp;
const path = require('path');
const fs = require('fs');

const sourceDirectory = 'out';
const destinationDirectory = 'dist';

// Ensure the destination directory exists
if (!fs.existsSync(destinationDirectory)) {
    fs.mkdirSync(destinationDirectory, { recursive: true });
}

// Copy function that excludes .js and .ts files
const copyFiles = (source, destination) => {
    return new Promise((resolve, reject) => {
        ncp(source, destination, { filter: filename => {
            const ext = path.extname(filename);
            return ext !== '.js' && ext !== '.ts';
        }}, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

// Async function to handle the process
const processFiles = async () => {
    try {
        await copyFiles(sourceDirectory, destinationDirectory);
        console.log(`Files copied from ${sourceDirectory} to ${destinationDirectory}`);

        // Delete the source directory after copying
        fs.rmdirSync(sourceDirectory, { recursive: true });
        console.log(`Deleted source directory: ${sourceDirectory}`);
    } catch (err) {
        console.error('An error occurred:', err);
    }
};

processFiles();
