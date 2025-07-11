diff --git a/src/lib/customSupabaseClient.js b/src/lib/customSupabaseClient.js
index 08164ae485383a70c1ce5f88c6f9a773d4f9da3b..8c7ac0f50360418acb96eed808b58b7cca360dd7 100644
--- a/src/lib/customSupabaseClient.js
+++ b/src/lib/customSupabaseClient.js
@@ -1,6 +1,6 @@
 import { createClient } from '@supabase/supabase-js';
 
-const supabaseUrl = 'https://thceupkmlmusckmveele.supabase.co';
-const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoY2V1cGttbG11c2NrbXZlZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMDY0NDgsImV4cCI6MjA2MzY4MjQ0OH0.Zrb8fGdBm6M8gO-fYtOd-mMO7n3X7OYFhdZk7Px1DQQ';
+const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
+const supabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY;
 
 export const supabase = createClient(supabaseUrl, supabaseAnonKey);
