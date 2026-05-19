import fs from 'fs';
console.log("DUMPING ENV:");
const cleanEnv = { ...process.env };
delete cleanEnv.PATH;
delete cleanEnv.npm_config_user_agent;
console.log(cleanEnv);
