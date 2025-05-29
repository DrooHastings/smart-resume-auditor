# Smart Resume Auditor

Smart Resume Auditor is a Node.js/Express application that uses OpenAI GPT-4 and embeddings to analyze a resume against a job description. It provides a match score, identifies missing skills, suggests resume bullet rewrites, and checks for job title matches. The app supports exporting resumes as DOCX and includes robust test and migration tooling.

## Features

- Extracts and compares skills from resume and job description
- Computes multiple similarity metrics (Jaccard, embedding-based, etc.)
- Identifies missing skills and suggests new resume bullets
- Simple web UI for user interaction
- API endpoint for programmatic access
- Exports resumes as DOCX using the docx npm package
- Test data isolation for safe, repeatable testing
- Migration script for evolving the database schema

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
4. **Run database migrations:**
   ```bash
   node migrate.js
   ```
5. **Run the server:**
   ```bash
   node server.js
   ```
6. **Open the app:**
   - Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

To run the included test script (which uses isolated test data):

```bash
node api/test-analyze.js
```

## Database Migrations

- The `migrate.js` script will check for and apply any necessary schema changes (such as new columns for test data isolation).
- Run it any time you pull new changes that may affect the database schema.

## License

MIT
