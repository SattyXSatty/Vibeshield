const http = require('http');

const port = 3000;
const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World');
});

// Simulate a slow build process
console.log('Building project...');
setTimeout(() => {
    console.log('Build completed in 1200ms.');
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}/`);
        console.log('Ready on http://localhost:3000');
    });
}, 2000);
