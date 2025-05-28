# Smart Resume Auditor

Smart Resume Auditor is a Node.js/Express application that uses OpenAI GPT-4 and embeddings to analyze a resume against a job description. It provides a match score, identifies missing skills, suggests resume bullet rewrites, and checks for job title matches.

## Features

- Extracts and compares skills from resume and job description
- Computes multiple similarity metrics (Jaccard, embedding-based, etc.)
- Identifies missing skills and suggests new resume bullets
- Simple web UI for user interaction
- API endpoint for programmatic access

## Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd smart-resume-auditor
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Set up your OpenAI API key:**
   - Create a `.env` file in the root directory:
     ```
     OPENAI_API_KEY=your_openai_api_key_here
     ```
4. **Run the server:**
   ```bash
   node server.js
   ```
5. **Open the app:**
   - Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

To run the included test script:

```bash
node api/test-analyze.js
```

## License

MIT
