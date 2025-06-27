import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function setupSupabaseDatabase() {
    try {
        console.log('🚀 Setting up Supabase database for vector storage...');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_API_KEY;
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_API_KEY in environment variables');
        }
        console.log(`📡 Connecting to Supabase at: ${supabaseUrl}`);
        // Create Supabase client with service role key for admin operations
        const supabase = createClient(supabaseUrl, supabaseKey);
        // Read the SQL setup script
        const sqlPath = path.join(__dirname, '..', '..', 'setup-supabase.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
        console.log('📄 Executing database setup script...');
        // Execute the SQL setup
        const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
        if (error) {
            // If the exec_sql function doesn't exist, we'll try a different approach
            console.log('⚠️  Direct SQL execution not available. Checking table existence...');
            // Check if documents table exists
            const { data: tableCheck, error: tableError } = await supabase
                .from('documents')
                .select('count(*)')
                .limit(1);
            if (tableError && tableError.code === '42P01') {
                console.log('❌ Documents table does not exist.');
                console.log('🔧 Please run the following SQL in your Supabase SQL Editor:');
                console.log('\n' + '='.repeat(50));
                console.log(sqlContent);
                console.log('='.repeat(50) + '\n');
                throw new Error('Please set up the database tables manually using the SQL above');
            }
            else if (tableError) {
                throw tableError;
            }
            else {
                console.log('✅ Documents table already exists');
            }
        }
        else {
            console.log('✅ Database setup completed successfully');
        }
        // Test the setup by checking table structure
        console.log('🔍 Verifying table structure...');
        const { data: tableInfo, error: infoError } = await supabase
            .from('documents')
            .select('*')
            .limit(1);
        if (infoError) {
            throw new Error(`Table verification failed: ${infoError.message}`);
        }
        console.log('✅ Database verification completed');
        console.log('🎯 Your Supabase database is ready for vector storage!');
        console.log('\nNext steps:');
        console.log('1. Run: npm run init-embeddings');
        console.log('2. Start your application');
    }
    catch (error) {
        console.error('❌ Failed to setup Supabase database:', error);
        process.exit(1);
    }
}
// Run the setup
setupSupabaseDatabase()
    .then(() => {
    console.log('🎉 Supabase setup completed');
    process.exit(0);
})
    .catch((error) => {
    console.error('💥 Supabase setup failed:', error);
    process.exit(1);
});
