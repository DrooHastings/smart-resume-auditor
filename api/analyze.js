const { OpenAI } = require('openai');
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const router = express.Router();
router.use(bodyParser.json());
router.use(cors());

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

router.post('/analyze', async (req, res) => {
    const { resume, jobDesc } = req.body;

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

    // Ask GPT to generate 3 new resume bullets that integrate the missing skills
    let bulletsForMissingSkills = '';
    if (missingSkills.length > 0) {
        const bulletsPrompt = `Write 3 new resume bullets that integrate the following missing skills into the candidate's experience. Use the context of the resume and job description for realism.\n\nMissing Skills: ${missingSkills.join(', ')}\n\nRESUME:\n${resume}\n\nJOB DESCRIPTION:\n${jobDesc}`;
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

    res.json({
        matchScore: finalMatchScore,
        missingSkills,
        suggestedBullets: bulletsForMissingSkills,
        titleMatch: jobTitleMatch
    });
});

module.exports = router;