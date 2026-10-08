import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hwvxmcpgrgdjyxofsmll.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3dnhtY3Bncmdkanl4b2ZzbWxsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDc4MzI0MCwiZXhwIjoyMTA2MzU5MjQwfQ.cmWiZhZ7PYLA50FkKQAArgjdBYf4YDw9vF-yCafPLa8";

async function testConnection() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log("Conectando a Supabase...");
  // Intentar listar tablas o consultar algo simple
  const { data, error } = await supabase.from("settings").select("*");
  if (error) {
    console.log("Respuesta de Supabase (esperado si las tablas aún no existen):", error.message);
  } else {
    console.log("Conexión exitosa, datos:", data);
  }
}

testConnection();
