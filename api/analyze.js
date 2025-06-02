const { OpenAI } = require('openai');
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun } = require('docx');
const fs = require('fs');
const db = require('../db');

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const router = express.Router();
router.use(bodyParser.json());
router.use(cors());

let savedResume = null; // Simulated DB for the saved resume

function cosineSimilarity(a, b) {
    const dot = a.reduce((acc, val, i) => acc + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((acc, val) => acc + val * val, 0));
    const magB = Math.sqrt(b.reduce((acc, val) => acc + val * val, 0));
    return dot / (magA * magB);
}

function jaccardSimilarity(listA, listB) {
    const setA = new Set(listA.map(s => s.trim().toLowerCase()).filter(Boolean));
    const setB = new Set(listB.map(s => s.trim().toLowerCase()).filter(Boolean));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

// Utility to fill a template with data
function fillTemplate(data, template) {
    let result = JSON.stringify(template);
    for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('bullet_')) {
            const token = `{{${key}}}`;
            result = result.split(token).join(value);
        }
    }
    return JSON.parse(result);
}

// Helper to get the latest original resume from the DB
function getLatestResume(callback, isTest) {
    const query = isTest
        ? 'SELECT * FROM resumes WHERE gpt_enhanced_data IS NULL AND is_test_data=1 ORDER BY created_at DESC LIMIT 1'
        : 'SELECT * FROM resumes WHERE gpt_enhanced_data IS NULL ORDER BY created_at DESC LIMIT 1';
    db.get(query, (err, row) => {
        if (err) return callback(err);
        callback(null, row);
    });
}

// Helper to get the latest enhanced resume from the DB
function getLatestEnhancedResume(callback, isTest) {
    const query = isTest
        ? 'SELECT * FROM resumes WHERE gpt_enhanced_data IS NOT NULL AND is_test_data=1 ORDER BY created_at DESC LIMIT 1'
        : 'SELECT * FROM resumes WHERE gpt_enhanced_data IS NOT NULL ORDER BY created_at DESC LIMIT 1';
    db.get(query, (err, row) => {
        if (err) return callback(err);
        callback(null, row);
    });
}

router.post('/analyze', async (req, res) => {
    const { jobDesc, isTest } = req.body;
    getLatestResume(async (err, row) => {
        if (err || !row) {
            return res.status(400).json({ error: 'No resume data saved. Please save your resume first.' });
        }
        const savedResume = JSON.parse(row.resume_data);
        // Flatten the savedResume bullets into a single string for analysis
        const resumeBullets = savedResume.experience
            .map(exp => exp.bullets.filter(Boolean).join('\n'))
            .filter(Boolean)
            .join('\n');
        // Optionally include summary, skills, etc. for richer context
        const resume = [
            savedResume.name,
            savedResume.email,
            savedResume.phone,
            savedResume.summary,
            resumeBullets,
            savedResume.skills
        ].filter(Boolean).join('\n');

        // Extract skills from resume
        const skillsResumePrompt = `Extract a comma-separated list of skills from the following resume. Only list the skills, nothing else.\n\nRESUME:\n${resume}`;
        const skillsResumeCompletion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: skillsResumePrompt }],
        });
        const skillsResume = skillsResumeCompletion.choices[0].message.content.trim();
        console.log('Extracted skills from resume:', skillsResume);

        // Extract skills from job description
        const skillsJobPrompt = `Extract a comma-separated list of skills from the following job description. Only list the skills, nothing else.\n\nJOB DESCRIPTION:\n${jobDesc}`;
        const skillsJobCompletion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: skillsJobPrompt }],
        });
        const skillsJob = skillsJobCompletion.choices[0].message.content.trim();
        console.log('Extracted skills from job description:', skillsJob);

        // Extract job titles/roles from resume
        const titlesResumePrompt = `Extract a comma-separated list of job titles or roles mentioned in the following resume. Only list the titles, nothing else.\n\nRESUME:\n${resume}`;
        const titlesResumeCompletion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: titlesResumePrompt }],
        });
        const titlesResume = titlesResumeCompletion.choices[0].message.content.trim();
        console.log('Extracted titles from resume:', titlesResume);

        // Extract job titles/roles from job description
        const titlesJobPrompt = `Extract a comma-separated list of job titles or roles mentioned in the following job description. Only list the titles, nothing else.\n\nJOB DESCRIPTION:\n${jobDesc}`;
        const titlesJobCompletion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: titlesJobPrompt }],
        });
        const titlesJob = titlesJobCompletion.choices[0].message.content.trim();
        console.log('Extracted titles from job description:', titlesJob);

        const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: [resume, jobDesc],
        });
        console.log('Resume and job description embeddings created.');

        const [resumeVec, jobVec] = embedding.data.map(d => d.embedding);
        const similarity = cosineSimilarity(resumeVec, jobVec);
        const matchScore = Math.round(similarity * 100);

        const prompt = `
You are a resume optimization assistant. Rewrite 3–5 resume bullets to better match this job:

JOB:
${jobDesc}

RESUME:
${resume}
`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
        });

        const rewritten = completion.choices[0].message.content;

        // Calculate Jaccard similarity between skill sets
        const skillsResumeArr = skillsResume.split(',').map(s => s.trim()).filter(Boolean);
        const skillsJobArr = skillsJob.split(',').map(s => s.trim()).filter(Boolean);
        const skillsJaccard = jaccardSimilarity(skillsResumeArr, skillsJobArr);
        console.log('Jaccard similarity:', skillsJaccard);

        // Calculate embedding-based semantic similarity between the skill lists
        let skillsSemanticSimilarity = null;
        try {
            const skillsEmbedding = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: [skillsResume, skillsJob],
            });
            const [skillsResumeVec, skillsJobVec] = skillsEmbedding.data.map(d => d.embedding);
            skillsSemanticSimilarity = cosineSimilarity(skillsResumeVec, skillsJobVec);
        } catch (e) {
            // If embedding fails, leave as null
            skillsSemanticSimilarity = null;
        }

        // Vectorize both skill lists (each skill separately) and compute average cosine similarity
        let skillsAverageCosineSimilarity = null;
        try {
            // Only compare if both lists have at least one skill
            if (skillsResumeArr.length > 0 && skillsJobArr.length > 0) {
                // Get embeddings for all skills in both lists
                const allSkills = [...skillsResumeArr, ...skillsJobArr];
                const embeddingsResp = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: allSkills,
                });
                const embeddings = embeddingsResp.data.map(d => d.embedding);
                const resumeEmbeddings = embeddings.slice(0, skillsResumeArr.length);
                const jobEmbeddings = embeddings.slice(skillsResumeArr.length);
                // Compute cosine similarity for each pair (resume skill vs each job skill)
                let totalSim = 0;
                let count = 0;
                for (const rVec of resumeEmbeddings) {
                    for (const jVec of jobEmbeddings) {
                        totalSim += cosineSimilarity(rVec, jVec);
                        count++;
                    }
                }
                skillsAverageCosineSimilarity = count > 0 ? totalSim / count : null;
            }
        } catch (e) {
            skillsAverageCosineSimilarity = null;
        }

        // Calculate final matchScore by averaging all normalized metrics
        const metrics = [
            skillsJaccard,
            skillsSemanticSimilarity,
            skillsAverageCosineSimilarity,
            matchScore / 100
        ].filter(x => typeof x === 'number' && !isNaN(x));

        const finalMatchScore = metrics.length > 0
            ? Math.round((metrics.reduce((a, b) => a + b, 0) / metrics.length) * 100)
            : null;
        console.log('Final match score:', finalMatchScore);

        // Check for job title match (direct match or fuzzy contains)
        function normalizeTitles(str) {
            return str.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        }
        const resumeTitlesArr = normalizeTitles(titlesResume);
        const jobTitlesArr = normalizeTitles(titlesJob);
        let jobTitleMatch = false;
        for (const rTitle of resumeTitlesArr) {
            for (const jTitle of jobTitlesArr) {
                if (
                    rTitle === jTitle ||
                    rTitle.includes(jTitle) ||
                    jTitle.includes(rTitle)
                ) {
                    jobTitleMatch = true;
                    break;
                }
            }
            if (jobTitleMatch) break;
        }
        console.log('Job title match:', jobTitleMatch);

        // Identify top 2–3 missing skills (in job, not in resume)
        function getMissingSkills(jobSkills, resumeSkills, topN = 3) {
            const resumeSet = new Set(resumeSkills.map(s => s.toLowerCase()));
            // Only include job skills not present in resume skills
            const missing = jobSkills.filter(s => !resumeSet.has(s.toLowerCase()));
            // Return up to topN missing skills
            return missing.slice(0, topN);
        }
        const missingSkills = getMissingSkills(skillsJobArr, skillsResumeArr, 3);
        console.log('Missing skills:', missingSkills);

        // Ask GPT to generate 10 new resume bullets that integrate the missing skills
        let bulletsForMissingSkills = '';
        if (missingSkills.length > 0) {
            const bulletsPrompt = `Write up to 10 new resume bullets that integrate the following missing skills into the candidate's experience, but only if they are supported by the actual resume content.\n- Do not invent or exaggerate experience, achievements, or skills that are not present in the resume.\n- If a missing skill cannot be truthfully integrated based on the resume, do not include it.\n- Use the language and context of the resume and job description for realism, but prioritize accuracy and truthfulness.\n\nMissing Skills: ${missingSkills.join(', ')}\n\nRESUME:\n${resume}\n\nJOB DESCRIPTION:\n${jobDesc}`;
            try {
                const bulletsCompletion = await openai.chat.completions.create({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: bulletsPrompt }],
                });
                bulletsForMissingSkills = bulletsCompletion.choices[0].message.content.trim();
            } catch (e) {
                bulletsForMissingSkills = '';
            }
        }
        console.log('Suggested bullets for missing skills:', bulletsForMissingSkills);

        // After generating suggested bullets, update the saved resume with new bullets (simulate DB write)
        if (bulletsForMissingSkills) {
            const newBullets = bulletsForMissingSkills
                .split(/\n\s*\d+\.\s*/)
                .map(b => b.trim())
                .filter(Boolean);
            if (savedResume && savedResume.experience && savedResume.experience.length > 0) {
                for (let i = 0; i < Math.min(newBullets.length, savedResume.experience[0].bullets.length); i++) {
                    savedResume.experience[0].bullets[i] = newBullets[i];
                }
            }
            // Save enhanced resume to DB
            db.run(
                'INSERT INTO resumes (template_id, resume_data, gpt_enhanced_data, job_description) VALUES (?, ?, ?, ?)',
                [
                    row.template_id || 'default',
                    row.resume_data,
                    JSON.stringify(savedResume),
                    jobDesc
                ]
            );
        }

        res.json({
            matchScore: finalMatchScore,
            missingSkills,
            suggestedBullets: bulletsForMissingSkills,
            titleMatch: jobTitleMatch
        });
    }, isTest);
});

router.post('/save-resume', (req, res) => {
    const { resumeData, isTestData } = req.body;
    const template_id = 'default';
    db.run(
        'INSERT INTO resumes (template_id, resume_data, is_test_data) VALUES (?, ?, ?)',
        [template_id, JSON.stringify(resumeData), isTestData ? 1 : 0],
        function (err) {
            if (err) {
                console.error('DB save error:', err);
                return res.status(500).json({ success: false, message: 'Failed to save resume.' });
            }
            res.json({ success: true, message: 'Resume data saved!', id: this.lastID });
        }
    );
});

router.get('/saved-resume', (req, res) => {
    const isTest = req.query.isTest === 'true';
    getLatestResume((err, row) => {
        if (err || !row) return res.json({ exists: false });
        let resume = null;
        try {
            resume = JSON.parse(row.resume_data);
        } catch (e) {
            return res.json({ exists: true, error: 'Failed to parse resume data.' });
        }
        res.json({ exists: true, resume });
    }, isTest);
});

router.get('/download-resume', (req, res) => {
    const isTest = req.query.isTest === 'true';
    getLatestEnhancedResume((err, row) => {
        let resumeObj = null;
        if (row && row.gpt_enhanced_data) {
            resumeObj = JSON.parse(row.gpt_enhanced_data);
            sendDocx(res, resumeObj);
        } else {
            getLatestResume((err2, row2) => {
                if (err2 || !row2) {
                    return res.status(400).json({ error: 'No resume data saved.' });
                }
                resumeObj = JSON.parse(row2.resume_data);
                sendDocx(res, resumeObj);
            }, isTest);
        }
    }, isTest);
});

function sendDocx(res, resumeObj) {
    try {
        const sections = [];

        // Centered image at the top (replace name)
        try {
            const imagePath = 'public/assets/HASTINGS.png';
            const imageBuffer = fs.readFileSync(imagePath);
            // Set width to 3 inches (3 * 96 = 288) and height to 1.5 inches (1.5 * 96 = 144)
            const width = 288;
            const height = 144;
            sections.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new ImageRun({
                        data: imageBuffer,
                        transformation: { width: width, height: height }
                    })
                ],
                spacing: { after: 40 }
            }));
        } catch (e) {
            console.error('Failed to load image for DOCX:', e);
            // If image fails, fallback to placeholder text
            sections.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: '[HASTINGS LOGO]', bold: true, size: 48, font: "Calibri", color: "8B0000" })
                ],
                spacing: { after: 80 }
            }));
        }

        // Contact info (centered, smaller)
        sections.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: `${resumeObj.email} | ${resumeObj.phone}`, size: 22, font: "Calibri", color: "666666" }),
            ],
            spacing: { after: 80 }
        }));

        // Horizontal line (dark red)
        sections.push(new Paragraph({
            border: { bottom: { color: "8B0000", space: 1, value: "single", size: 6 } },
            spacing: { after: 120 }
        }));

        // Summary
        if (resumeObj.summary) {
            sections.push(new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [
                    new TextRun({ text: "Summary", color: "8B0000", bold: true })
                ],
                spacing: { after: 40, before: 120 }
            }));
            sections.push(new Paragraph({
                text: resumeObj.summary,
                spacing: { after: 120 }
            }));
        }

        // Experience
        if (resumeObj.experience && resumeObj.experience.length > 0) {
            sections.push(new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [
                    new TextRun({ text: "Experience", color: "8B0000", bold: true })
                ],
                spacing: { after: 40, before: 120 }
            }));
            resumeObj.experience.forEach(exp => {
                // Job title and company (bold), location/dates (italic, right)
                sections.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${exp.job_title} - ${exp.company}`, bold: true, size: 22 }),
                        new TextRun({ text: `   ${exp.location} | ${exp.dates}`, italics: true, size: 22, color: "666666" })
                    ],
                    spacing: { after: 20 }
                }));
                // Bullets
                exp.bullets.forEach(bullet => {
                    if (bullet) {
                        sections.push(new Paragraph({
                            text: bullet,
                            bullet: { level: 0 },
                            spacing: { after: 10 }
                        }));
                    }
                });
                sections.push(new Paragraph({})); // Extra space after each job
            });
        }

        // Education
        if (resumeObj.education && resumeObj.education.length > 0) {
            sections.push(new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [
                    new TextRun({ text: "Education", color: "8B0000", bold: true })
                ],
                spacing: { after: 40, before: 120 }
            }));
            resumeObj.education.forEach(edu => {
                sections.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${edu.degree} - ${edu.school}`, bold: true, size: 22 }),
                        new TextRun({ text: `   ${edu.dates}`, italics: true, size: 22, color: "666666" })
                    ],
                    spacing: { after: 20 }
                }));
            });
        }

        // Skills
        if (resumeObj.skills) {
            sections.push(new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [
                    new TextRun({ text: "Skills", color: "8B0000", bold: true })
                ],
                spacing: { after: 40, before: 120 }
            }));
            // Split skills into bullets if comma-separated
            const skillsArr = resumeObj.skills.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
            skillsArr.forEach(skill => {
                sections.push(new Paragraph({
                    text: skill,
                    bullet: { level: 0 },
                    spacing: { after: 10 }
                }));
            });
        }

        // Build the document
        const doc = new Document({
            creator: "Smart Resume Auditor",
            title: "Resume",
            description: "Generated resume document",
            sections: [{ children: sections }]
        });

        Packer.toBuffer(doc)
            .then(buffer => {
                res.setHeader('Content-Disposition', 'attachment; filename=resume.docx');
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.send(buffer);
            })
            .catch(err => {
                console.error('DOCX generation error:', err);
                res.status(500).json({ error: 'Failed to generate DOCX.' });
            });
    } catch (err) {
        console.error('DOCX build error:', err);
        res.status(500).json({ error: 'Failed to build DOCX.' });
    }
}

router.get('/preview-enhanced-resume', (req, res) => {
    const isTest = req.query.isTest === 'true';
    getLatestEnhancedResume((err, row) => {
        if (err || !row) return res.status(404).json({ error: 'No enhanced resume found.' });
        res.json({ resume: JSON.parse(row.gpt_enhanced_data) });
    }, isTest);
});

// List all enhanced resumes
router.get('/enhanced-resumes', (req, res) => {
    console.log('ENHANCED ENDPOINT HIT');
    db.all(
        'SELECT id, created_at, job_description, gpt_enhanced_data FROM resumes WHERE gpt_enhanced_data IS NOT NULL ORDER BY created_at DESC',
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'DB error' });
            const results = rows.map(row => ({
                id: row.id,
                created_at: row.created_at,
                job_description: row.job_description,
                resume: JSON.parse(row.gpt_enhanced_data)
            }));
            res.json({ resumes: results });
        }
    );
});

// Delete an enhanced resume by ID
router.delete('/enhanced-resumes/:id', (req, res) => {
    const id = req.params.id;
    db.run(
        'DELETE FROM resumes WHERE id = ? AND gpt_enhanced_data IS NOT NULL',
        [id],
        function (err) {
            if (err) {
                console.error('DB delete error:', err);
                return res.status(500).json({ error: 'Failed to delete resume.' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Resume not found.' });
            }
            res.status(204).end();
        }
    );
});

// Download a specific enhanced resume as DOCX by ID
router.get('/enhanced-resumes/:id/download', (req, res) => {
    const id = req.params.id;
    db.get('SELECT gpt_enhanced_data FROM resumes WHERE id = ? AND gpt_enhanced_data IS NOT NULL', [id], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ error: 'Enhanced resume not found.' });
        }
        let resumeObj;
        try {
            resumeObj = JSON.parse(row.gpt_enhanced_data);
        } catch (e) {
            return res.status(500).json({ error: 'Failed to parse enhanced resume.' });
        }
        sendDocx(res, resumeObj);
    });
});

module.exports = router;