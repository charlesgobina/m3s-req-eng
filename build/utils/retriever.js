import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { OpenAIEmbeddings } from '@langchain/openai';
import { createClient } from '@supabase/supabase-js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from '@langchain/core/documents';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();
const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY
});
const supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);
const vectorstore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: 'documents',
    queryName: 'match_documents'
});
const retriever = vectorstore.asRetriever({
    k: 3,
});
export const createEmbeddingsFromFiles = async (filePaths) => {
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });
    const documents = [];
    for (const filePath of filePaths) {
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}`);
            continue;
        }
        const ext = path.extname(filePath).toLowerCase();
        let loader;
        try {
            if (ext === '.pdf') {
                loader = new PDFLoader(filePath);
            }
            else if (ext === '.txt' || ext === '.md' || ext === '') {
                loader = new TextLoader(filePath);
            }
            else {
                console.warn(`Unsupported file type: ${ext} for file ${filePath}`);
                continue;
            }
            const docs = await loader.load();
            const splitDocs = await textSplitter.splitDocuments(docs);
            // Add file metadata
            const docsWithMetadata = splitDocs.map(doc => new Document({
                pageContent: doc.pageContent,
                metadata: {
                    ...doc.metadata,
                    source: filePath,
                    filename: path.basename(filePath),
                    fileType: ext
                }
            }));
            documents.push(...docsWithMetadata);
        }
        catch (error) {
            console.error(`Error processing file ${filePath}:`, error);
        }
    }
    if (documents.length > 0) {
        await vectorstore.addDocuments(documents);
        console.log(`Successfully created embeddings for ${documents.length} document chunks`);
    }
};
export const createEmbeddingsFromText = async (texts, metadata = []) => {
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });
    const documents = [];
    for (let i = 0; i < texts.length; i++) {
        const splitDocs = await textSplitter.splitText(texts[i]);
        const docs = splitDocs.map(chunk => new Document({
            pageContent: chunk,
            metadata: metadata[i] || {}
        }));
        documents.push(...docs);
    }
    await vectorstore.addDocuments(documents);
};
export default retriever;
