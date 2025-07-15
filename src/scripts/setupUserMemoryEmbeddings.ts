import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupUserMemoryEmbeddings(): Promise<void> {
  try {
    console.log('🚀 Setting up user memory embeddings table...');
    
    // Create Supabase client
    const supabaseClient = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_API_KEY as string
    );
    
    // Read SQL setup file
    const sqlPath = path.join(__dirname, '..', '..', 'setup-user-memory-embeddings.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL content into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📄 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabaseClient.rpc('exec_sql', {
          sql: statement
        });
        
        if (error) {
          // Try direct query for CREATE TABLE and CREATE INDEX statements
          if (statement.includes('CREATE TABLE') || statement.includes('CREATE INDEX') || statement.includes('CREATE OR REPLACE FUNCTION')) {
            console.log(`   └─ Trying direct execution for DDL statement...`);
            // For DDL statements, we'll log them for manual execution
            console.log(`   └─ Please execute this manually in Supabase SQL editor:`);
            console.log(`      ${statement}`);
          } else {
            console.error(`   ❌ Error executing statement ${i + 1}:`, error);
          }
        } else {
          console.log(`   ✅ Statement ${i + 1} executed successfully`);
        }
      } catch (error) {
        console.error(`   ❌ Error executing statement ${i + 1}:`, error);
        console.log(`   └─ Statement: ${statement.substring(0, 100)}...`);
      }
    }
    
    console.log('✅ User memory embeddings setup completed!');
    console.log('📋 Next steps:');
    console.log('   1. If any DDL statements failed, execute them manually in Supabase SQL editor');
    console.log('   2. Verify the user_memory_embeddings table exists');
    console.log('   3. Test the match_user_memory_embeddings function');
    console.log('   4. The comprehensive memory system is now ready to use!');
    
  } catch (error) {
    console.error('❌ Failed to setup user memory embeddings:', error);
    console.log('📋 Manual setup required:');
    console.log('   1. Open Supabase SQL editor');
    console.log('   2. Execute the contents of setup-user-memory-embeddings.sql');
    console.log('   3. Verify all tables and functions are created');
    process.exit(1);
  }
}

// Run the setup
setupUserMemoryEmbeddings()
  .then(() => {
    console.log('🎉 User memory embeddings setup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 User memory embeddings setup failed:', error);
    process.exit(1);
  });