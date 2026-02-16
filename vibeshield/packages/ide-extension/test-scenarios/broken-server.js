const http = require('http');

console.log('Starting server...');
setTimeout(() => {
    // Simulate a syntax or runtime error
    console.log('Using database configuration...');
    try {
        const db = undefined;
        db.connect(); // This will throw TypeError
    } catch (e) {
        console.error('CRITICAL ERROR: Database connection failed');
        console.error(e.stack);
        process.exit(1);
    }
}, 1000);
