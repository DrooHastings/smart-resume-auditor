const fetch = require('node-fetch');

async function testAnalyze() {
    const testData = {
        resume: `John Doe\nSoftware Engineer\nSkills: JavaScript, Python, React\nExperience: Built web apps using React and Node.js.`,
        jobDesc: `Looking for a Software Engineer with experience in JavaScript, Python, React, and GraphQL. Must be familiar with Scrum methodologies.`
    };

    const res = await fetch('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData),
    });
    const data = await res.json();
    console.log('Test API response:', data);

    // Flexible pass/fail metric: case-insensitive, partial matches
    const missingSkillsLower = Array.isArray(data.missingSkills)
        ? data.missingSkills.map(s => s.toLowerCase())
        : [];
    if (
        data.matchScore >= 50 &&
        Array.isArray(data.missingSkills) &&
        missingSkillsLower.some(s => s.includes('graphql')) &&
        missingSkillsLower.some(s => s.includes('scrum')) &&
        typeof data.suggestedBullets === 'string' && data.suggestedBullets.length > 0 &&
        typeof data.titleMatch === 'boolean'
    ) {
        console.log('PASS: API returned expected structure and values.');
    } else {
        console.log('FAIL: API did not return expected structure or values.');
    }
}

testAnalyze(); 