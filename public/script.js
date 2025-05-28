async function analyze() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('results').innerHTML = '';
    await new Promise(r => setTimeout(r, 50)); // Force UI update before fetch
    try {
        const resume = document.getElementById('resume').value;
        const jobDesc = document.getElementById('jobDesc').value;
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume, jobDesc }),
        });
        const data = await res.json();
        console.log('API response:', data);
        document.getElementById('results').innerHTML = `
        <p><strong>Score:</strong> ${data.matchScore}%</p>
        <p><strong>Missing Skills:</strong> ${Array.isArray(data.missingSkills) && data.missingSkills.length > 0 ? data.missingSkills.join(', ') : 'None'}</p>
        <p><strong>Suggested Bullet Rewrites:</strong><br>${data.suggestedBullets ? data.suggestedBullets.replace(/\n/g, '<br>') : 'None'}</p>
      `;
    } catch (err) {
        document.getElementById('results').innerHTML = '<p style="color:red;">An error occurred. Please try again.</p>';
    } finally {
        document.getElementById('loader').style.display = 'none';
    }
}