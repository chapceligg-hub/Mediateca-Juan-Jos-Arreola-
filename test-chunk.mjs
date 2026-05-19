import { createClient } from '@insforge/sdk';
const ins = createClient({baseUrl: 'https://razyk54r.us-west.insforge.app', anonKey: 'ik_8d53a92b373f80470bd95201a42c4715'});
async function run() {
  const { data, error } = await ins.database.from('movies').select('*').range(0, 1);
  console.log("Keys:", Object.keys(data[0]));
}
run();
