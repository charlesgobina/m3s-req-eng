import { pipeline } from '@xenova/transformers';
class TransformerEmbeddings {
    extractor;
    isInitialized = false;
    async initialize() {
        if (this.isInitialized)
            return; // Prevent double initialization
        console.log("📥 Loading Xenova/all-MiniLM-L6-v2 model...");
        this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        this.isInitialized = true;
        console.log("✅ Model loaded and ready!");
    }
    async embedQuery(text) {
        if (!this.isInitialized) {
            await this.initialize(); // Auto-initialize if needed
        }
        const output = await this.extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }
    async embedDocuments(texts) {
        return Promise.all(texts.map(text => this.embedQuery(text)));
    }
}
export const transformerEmbeddings = new TransformerEmbeddings();
export default TransformerEmbeddings;
