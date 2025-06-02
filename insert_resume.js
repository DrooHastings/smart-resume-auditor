const fs = require('fs');
const path = require('path');
const db = require('./db');

const resumeData = fs.readFileSync(path.join(__dirname, 'resume.json'), 'utf8');
db.run(
    'INSERT INTO resumes (template_id, resume_data, is_test_data) VALUES (?, ?, ?)',
    ['default', resumeData, 0],
    function (err) {
        if (err) {
            console.error('DB save error:', err);
            process.exit(1);
        }
        console.log('Resume inserted with ID:', this.lastID);
        process.exit(0);
    }
); 