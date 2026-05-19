import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wtgydqvcgafdyfppofpw.supabase.co';
const supabaseKey = 'sb_publishable__eozF6rdFOLwuM_Pn4nDvA_bUWrbg0z';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('movies').select('*').limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Success:", data);
  }
}

run();
