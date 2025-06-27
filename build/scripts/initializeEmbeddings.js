import { createEmbeddingsFromFiles } from '../utils/retriever.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function initializeProjectContext() {
    try {
        console.log('🚀 Starting embedding initialization...');
        // Get project root directory (go up from src/scripts to project root)
        const projectRoot = path.resolve(__dirname, '..', '..');
        const projectSpecPath = path.join(projectRoot, 'educonnect-project-specification.md');
        // Check if the project specification file exists
        if (!fs.existsSync(projectSpecPath)) {
            throw new Error(`Project specification file not found at: ${projectSpecPath}`);
        }
        console.log(`📄 Found project specification at: ${projectSpecPath}`);
        console.log('⏳ Creating embeddings from project context...');
        // Create embeddings from the project specification
        await createEmbeddingsFromFiles([projectSpecPath]);
        console.log('✅ Project context embeddings initialized successfully!');
        console.log('🎯 RAG system is now ready for student interactions');
    }
    catch (error) {
        console.error('❌ Failed to initialize embeddings:', error);
        process.exit(1);
    }
}
// Run the initialization
initializeProjectContext()
    .then(() => {
    console.log('🎉 Embedding initialization completed');
    process.exit(0);
})
    .catch((error) => {
    console.error('💥 Embedding initialization failed:', error);
    process.exit(1);
});
