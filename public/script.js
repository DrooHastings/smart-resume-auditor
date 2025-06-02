const CIRCUIT_BREAKER = false; // Set to false to enable API calls

function getResumeDataFromForm() {
    const data = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        summary: document.getElementById('summary').value,
        experience: [],
        education: [
            {
                degree: document.getElementById('degree_1').value,
                school: document.getElementById('school_1').value,
                dates: document.getElementById('school_1_dates').value
            }
        ],
        skills: document.getElementById('skills').value
    };
    // Parse core skills into bullets
    const coreSkillsRaw = document.getElementById('coreSkills')?.value || '';
    // Split by newlines or section headers (e.g., 'Frontend:', 'Backend:', etc.)
    // If no section headers, treat as one group
    let coreSkills = [];
    if (coreSkillsRaw.match(/\w+:/)) {
        // Sectioned format
        const sectionRegex = /([\w &+\/-]+):\s*([^\n]+)/g;
        let match;
        while ((match = sectionRegex.exec(coreSkillsRaw)) !== null) {
            const section = match[1].trim();
            const skills = match[2].split(/[,;]+/).map(s => s.trim()).filter(Boolean);
            if (skills.length > 0) {
                coreSkills.push({ section, skills });
            }
        }
    } else {
        // Flat format
        const skills = coreSkillsRaw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
        if (skills.length > 0) {
            coreSkills.push({ section: '', skills });
        }
    }
    data.coreSkills = coreSkills;
    data.coreSkillsRaw = coreSkillsRaw;
    // Gather all experience entries
    let idx = 1;
    while (document.getElementById(`job_${idx}_title`)) {
        data.experience.push({
            job_title: document.getElementById(`job_${idx}_title`).value,
            company: document.getElementById(`job_${idx}_company`).value,
            location: document.getElementById(`job_${idx}_location`).value,
            dates: document.getElementById(`job_${idx}_dates`).value,
            bullets: [
                document.getElementById(`bullet_${idx}_1`).value,
                document.getElementById(`bullet_${idx}_2`).value,
                document.getElementById(`bullet_${idx}_3`).value
            ]
        });
        idx++;
    }
    return data;
}

async function analyze() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('results').innerHTML = '';
    await new Promise(r => setTimeout(r, 50)); // Force UI update before fetch
    try {
        const resumeData = getResumeDataFromForm();
        const jobDesc = document.getElementById('jobDesc').value;
        if (CIRCUIT_BREAKER) {
            console.log('CIRCUIT BREAKER ENABLED');
            console.log('Resume Data:', resumeData);
            console.log('Job Description:', jobDesc);
            document.getElementById('results').innerHTML = '<p style="color:orange;">Circuit breaker is enabled. Data was not sent to the API.</p>';
            return;
        }
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resumeData, jobDesc }),
        });
        const data = await res.json();
        console.log('API response:', data);
        // Update only the bullets in the UI if suggestedBullets are returned (for now, just show results)
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

window.onload = async function () {
    const formContainer = document.getElementById('resumeFormContainer');
    const changeResumeBtn = document.getElementById('changeResumeBtn');
    // Check for saved resume
    try {
        const res = await fetch('/api/saved-resume');
        const data = await res.json();
        if (data.exists) {
            formContainer.style.display = 'none';
            changeResumeBtn.style.display = 'inline-block';
        } else {
            formContainer.style.display = 'block';
            changeResumeBtn.style.display = 'none';
        }
    } catch (err) {
        formContainer.style.display = 'block';
        changeResumeBtn.style.display = 'none';
    }
    changeResumeBtn.onclick = function () {
        if (confirm('Are you sure you want to overwrite your saved resume?')) {
            formContainer.style.display = 'block';
            changeResumeBtn.style.display = 'none';
        }
    };
};

document.getElementById('saveResumeBtn').onclick = async function () {
    const resumeData = getResumeDataFromForm();
    document.getElementById('loader').style.display = 'block';
    document.getElementById('results').innerHTML = '';
    try {
        const res = await fetch('/api/save-resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resumeData }),
        });
        const data = await res.json();
        document.getElementById('results').innerHTML = `<p style=\"color:green;\">Resume data saved!</p>`;
        console.log('Save Resume Data response:', data);
        // Hide form and show change button after save
        document.getElementById('resumeFormContainer').style.display = 'none';
        document.getElementById('changeResumeBtn').style.display = 'inline-block';
    } catch (err) {
        document.getElementById('results').innerHTML = '<p style=\"color:red;\">Failed to save resume data.</p>';
    } finally {
        document.getElementById('loader').style.display = 'none';
    }
};

document.getElementById('downloadResumeBtn').onclick = async function () {
    document.getElementById('loader').style.display = 'block';
    try {
        const res = await fetch('/api/download-resume');
        if (!res.ok) {
            throw new Error('No resume data saved or error generating DOCX.');
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'resume.docx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        document.getElementById('results').innerHTML = '<p style="color:red;">Failed to download resume.</p>';
    } finally {
        document.getElementById('loader').style.display = 'none';
    }
};

document.getElementById('previewResumeBtn').onclick = async function () {
    document.getElementById('loader').style.display = 'block';
    try {
        const res = await fetch('/api/preview-enhanced-resume');
        if (!res.ok) throw new Error('No enhanced resume available.');
        const data = await res.json();
        // Render the enhanced resume in a readable format
        let html = '';
        if (data.resume) {
            html += `<h2>${data.resume.name}</h2>`;
            html += `<p>${data.resume.email} | ${data.resume.phone}</p>`;
            if (data.resume.summary) html += `<h3>Summary</h3><p>${data.resume.summary}</p>`;
            if (data.resume.experience && data.resume.experience.length > 0) {
                html += `<h3>Experience</h3>`;
                data.resume.experience.forEach(exp => {
                    html += `<strong>${exp.job_title} - ${exp.company} (${exp.location}) [${exp.dates}]</strong><ul>`;
                    exp.bullets.forEach(bullet => {
                        if (bullet) html += `<li>${bullet}</li>`;
                    });
                    html += `</ul>`;
                });
            }
            if (data.resume.education && data.resume.education.length > 0) {
                html += `<h3>Education</h3>`;
                data.resume.education.forEach(edu => {
                    html += `<p>${edu.degree} - ${edu.school} (${edu.dates})</p>`;
                });
            }
            if (data.resume.skills) {
                html += `<h3>Skills</h3><p>${data.resume.skills}</p>`;
            }
        } else {
            html = '<p>No enhanced resume available.</p>';
        }
        document.getElementById('previewContent').innerHTML = html;
        document.getElementById('previewModal').style.display = 'flex';
    } catch (err) {
        document.getElementById('results').innerHTML = '<p style="color:red;">Failed to load enhanced resume preview.</p>';
    } finally {
        document.getElementById('loader').style.display = 'none';
    }
};
document.getElementById('closePreviewModal').onclick = function () {
    document.getElementById('previewModal').style.display = 'none';
};