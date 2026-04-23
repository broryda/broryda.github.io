const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.static('public'));

// Endpoint to list SGF files
app.get('/api/files', (req, res) => {
    const dirPath = __dirname;
    fs.readdir(dirPath, (err, files) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to read directory' });
        }
        
        // Filter for .sgf files and sort them naturally if possible
        const sgfFiles = files.filter(file => file.endsWith('.sgf'));
        
        // Simple natural sort for filenames like "1번...", "10번..."
        sgfFiles.sort((a, b) => {
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });

        res.json(sgfFiles);
    });
});

// Endpoint to get specific SGF content
app.get('/api/sgf/:filename', (req, res) => {
    const filename = req.params.filename;
    
    // Security check: ensure no directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).send('Invalid filename');
    }

    const filePath = path.join(__dirname, filename);
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', filePath, err);
            return res.status(404).send('File not found');
        }
        res.send(data);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
