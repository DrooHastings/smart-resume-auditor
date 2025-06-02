const fetch = require('node-fetch');
const fs = require('fs');

(async function testDownloadEnhancedResume() {
    try {
        console.log('Fetching list of enhanced resumes...');
        const listRes = await fetch('http://localhost:3000/api/enhanced-resumes');
        console.log('Status:', listRes.status);
        if (!listRes.ok) throw new Error('Failed to fetch enhanced resumes list');
        const listData = await listRes.json();
        if (!listData.resumes || listData.resumes.length === 0) {
            console.error('No enhanced resumes found.');
            process.exit(1);
        }
        const first = listData.resumes[0];
        console.log('Found enhanced resume with id:', first.id);
        const downloadUrl = `http://localhost:3000/api/enhanced-resumes/${first.id}/download`;
        console.log('Attempting to download DOCX from:', downloadUrl);
        const downloadRes = await fetch(downloadUrl);
        console.log('Download status:', downloadRes.status);
        console.log('Headers:', downloadRes.headers.raw());
        if (!downloadRes.ok) {
            const text = await downloadRes.text();
            console.error('Failed to download DOCX. Response:', text);
            process.exit(1);
        }
        const contentType = downloadRes.headers.get('content-type');
        if (!contentType || !contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
            console.error('Unexpected content-type:', contentType);
            process.exit(1);
        }
        const buffer = await downloadRes.buffer();
        fs.writeFileSync('test_download.docx', buffer);
        console.log('DOCX file downloaded and saved as test_download.docx');
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
})(); 