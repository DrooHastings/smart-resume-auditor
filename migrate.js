const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('resumes.db');

function columnExists(table, column, cb) {
    db.get(`PRAGMA table_info(${table})`, (err, row) => {
        if (err) return cb(err);
        db.all(`PRAGMA table_info(${table})`, (err, columns) => {
            if (err) return cb(err);
            const exists = columns.some(col => col.name === column);
            cb(null, exists);
        });
    });
}

function addIsTestDataColumnIfNeeded() {
    columnExists('resumes', 'is_test_data', (err, exists) => {
        if (err) {
            console.error('Error checking for is_test_data column:', err);
            db.close();
            return;
        }
        if (!exists) {
            db.run('ALTER TABLE resumes ADD COLUMN is_test_data INTEGER DEFAULT 0', err => {
                if (err) {
                    console.error('Error adding is_test_data column:', err);
                } else {
                    console.log('Added is_test_data column to resumes table.');
                }
                db.close();
            });
        } else {
            console.log('is_test_data column already exists.');
            db.close();
        }
    });
}

addIsTestDataColumnIfNeeded(); 