const fetch = require('node-fetch');
const assert = require('assert');
const fs = require('fs');

async function checkServer() {
    try {
        const res = await fetch('http://localhost:3000/api/saved-resume');
        if (!res.ok) throw new Error('Server not responding as expected');
        console.log('PASS: Server is running.');
        return true;
    } catch (err) {
        console.error('FAIL: Server is not running or not reachable at http://localhost:3000');
        return false;
    }
}

async function checkOriginalResume() {
    const res = await fetch('http://localhost:3000/api/saved-resume');
    const data = await res.json();
    if (data.exists) {
        console.log('PASS: Original resume exists in DB.');
        return true;
    } else {
        console.error('FAIL: No original resume found in DB. Please save a resume first.');
        return false;
    }
}

// Helper to seed the DB with a test resume
async function seedTestResume() {
    const resumeData = {
        name: "Test User",
        email: "test@example.com",
        phone: "123-456-7890",
        summary: "Test summary",
        experience: [
            {
                job_title: "Developer",
                company: "Test Co",
                location: "Remote",
                dates: "2020-2022",
                bullets: ["Did stuff", "More stuff", "Even more stuff"]
            }
        ],
        education: [
            { degree: "BS", school: "Test U", dates: "2016-2020" }
        ],
        skills: "JavaScript, Node.js"
    };
    const res = await fetch('http://localhost:3000/api/save-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeData, isTestData: true }),
    });
    const data = await res.json();
    assert(data.success, 'Test resume should be seeded successfully');
    console.log('PASS: Test resume seeded');
}

async function testSaveResume() {
    const resumeData = {
        name: "Test User",
        email: "test@example.com",
        phone: "123-456-7890",
        summary: "Test summary",
        experience: [
            {
                job_title: "Developer",
                company: "Test Co",
                location: "Remote",
                dates: "2020-2022",
                bullets: ["Did stuff", "More stuff", "Even more stuff"]
            }
        ],
        education: [
            { degree: "BS", school: "Test U", dates: "2016-2020" }
        ],
        skills: "JavaScript, Node.js"
    };
    const res = await fetch('http://localhost:3000/api/save-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeData }),
    });
    const data = await res.json();
    assert(data.success, 'Resume should be saved successfully');
    console.log('PASS: Save Resume');
}

async function testAnalyze() {
    const jobDesc = "Looking for a Developer with experience in JavaScript and Node.js.";
    const res = await fetch('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobDesc, isTest: true }),
    });
    const data = await res.json();
    assert(data.matchScore !== undefined, 'Should return a matchScore');
    assert(Array.isArray(data.missingSkills), 'Should return missingSkills array');
    assert(typeof data.suggestedBullets === 'string', 'Should return suggestedBullets');
    assert(typeof data.titleMatch === 'boolean', 'Should return titleMatch');
    console.log('PASS: Analyze Resume');
}

async function testPreviewEnhancedResume() {
    const res = await fetch('http://localhost:3000/api/preview-enhanced-resume?isTest=true');
    if (res.status === 404) {
        console.log('SKIP: No enhanced resume found (analyze must run first)');
        return;
    }
    const data = await res.json();
    assert(data.resume, 'Should return a resume object');
    assert(data.resume.experience && data.resume.experience.length > 0, 'Resume should have experience');
    console.log('PASS: Preview Enhanced Resume');
}

async function testDownloadResume() {
    const res = await fetch('http://localhost:3000/api/download-resume?isTest=true');
    assert(res.ok, 'Should successfully download resume');
    assert(res.headers.get('content-type').includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'Should return a DOCX file');
    // Optionally save the file to disk for manual inspection
    // const buffer = await res.buffer();
    // fs.writeFileSync('test_resume.docx', buffer);
    console.log('PASS: Download Resume as DOCX');
}

async function runTests() {
    try {
        const serverOk = await checkServer();
        if (!serverOk) return;

        // Seed the DB with test data
        await seedTestResume();

        const hasOriginal = await checkOriginalResume();
        if (!hasOriginal) return;

        await testAnalyze();
        await testPreviewEnhancedResume();
        await testDownloadResume();
        console.log('All tests completed.');
    } catch (err) {
        console.error('Test failed:', err);
    }
}

runTests(); 